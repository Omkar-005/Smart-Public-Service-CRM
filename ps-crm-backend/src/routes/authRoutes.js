const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getOfficers,
  getPendingOfficers,
  approveOfficer,
  rejectOfficer,
  assignRole,
  updateProfile,
} = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.post('/register',                                register);
router.post('/login',                                   login);
router.get('/officers',          protect, adminOnly,    getOfficers);
router.get('/officers/pending',  protect, adminOnly,    getPendingOfficers);
router.put('/officers/:id/approve', protect, adminOnly, approveOfficer);
router.put('/officers/:id/reject',  protect, adminOnly, rejectOfficer);
router.put('/assign-role',       protect, adminOnly,    assignRole);
router.put('/profile/:userId',   protect,               updateProfile);

module.exports = router;