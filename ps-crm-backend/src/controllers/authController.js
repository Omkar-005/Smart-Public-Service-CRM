const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Complaint = require('../models/Complaint');
const { sendOfficerPendingEmail, sendOfficerApprovalEmail, sendOfficerRejectionEmail } = require('../config/emailService');

// Generate JWT token
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { name, email, password, role, phone, ward, department } = req.body;

    // Block admin self-registration
    if (role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin accounts cannot be self-registered. Contact the system administrator.',
      });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Officers start as pending, citizens are active immediately
    const status = role === 'officer' ? 'pending' : 'active';

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role === 'officer' ? 'officer' : 'citizen',
      phone,
      ward,
      department: role === 'officer' ? department : undefined,
      status,
    });

    // Officer registration — notify them to wait for approval
    if (role === 'officer') {
      sendOfficerPendingEmail({ name, email, department });
      return res.status(201).json({
        success: true,
        pending: true,
        message: 'Registration submitted. Awaiting admin approval.',
      });
    }

    // Citizen — return token immediately
    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id, user.role),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Block pending officers
    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        pending: true,
        message: 'Your account is awaiting admin approval. You will be notified by email once approved.',
      });
    }

    // Block rejected officers
    if (user.status === 'rejected') {
      return res.status(403).json({
        success: false,
        rejected: true,
        message: `Your registration was rejected.${user.rejectionReason ? ' Reason: ' + user.rejectionReason : ' Please contact admin.'}`,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id, user.role),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/auth/officers — Active officers only (admin only)
const getOfficers = async (req, res) => {
  try {
    const officers = await User.find({ role: 'officer', status: 'active' }).select('-password');

    const enriched = await Promise.all(
      officers.map(async (o) => {
        const assignedCount = await Complaint.countDocuments({ assignedTo: o._id.toString() });
        const resolvedCount = await Complaint.countDocuments({ assignedTo: o._id.toString(), status: 'Resolved' });
        const pendingCount  = await Complaint.countDocuments({ assignedTo: o._id.toString(), status: 'Pending' });
        return { ...o.toObject(), assignedCount, resolvedCount, pendingCount };
      })
    );

    res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/auth/officers/pending — Pending officer requests (admin only)
const getPendingOfficers = async (req, res) => {
  try {
    const officers = await User.find({ role: 'officer', status: 'pending' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: officers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/auth/officers/:id/approve — Approve officer (admin only)
const approveOfficer = async (req, res) => {
  try {
    const officer = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'active' },
      { new: true }
    ).select('-password');

    if (!officer) {
      return res.status(404).json({ success: false, message: 'Officer not found' });
    }

    sendOfficerApprovalEmail(officer);
    res.status(200).json({ success: true, message: 'Officer approved successfully', data: officer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/auth/officers/:id/reject — Reject officer (admin only)
const rejectOfficer = async (req, res) => {
  try {
    const { reason } = req.body;

    const officer = await User.findById(req.params.id).select('-password');
    if (!officer) {
      return res.status(404).json({ success: false, message: 'Officer not found' });
    }

    await User.findByIdAndUpdate(req.params.id, {
      status: 'rejected',
      rejectionReason: reason || '',
    });

    sendOfficerRejectionEmail(officer, reason);
    res.status(200).json({ success: true, message: 'Officer rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/auth/assign-role — Admin only
const assignRole = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!['citizen', 'officer', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Must be citizen, officer, or admin.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No user found with that email address.' });
    }

    user.role = role;
    user.status = 'active';
    await user.save();

    res.status(200).json({
      success: true,
      message: `Role updated to "${role}" for ${user.name} (${user.email})`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { register, login, getOfficers, getPendingOfficers, approveOfficer, rejectOfficer, assignRole };