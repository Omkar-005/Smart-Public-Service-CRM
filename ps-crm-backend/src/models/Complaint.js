const mongoose = require('mongoose');

const imageSchema = {
  data:       { type: String },
  name:       { type: String },
  type:       { type: String },
  uploadedAt: { type: Date, default: Date.now },
};

const complaintSchema = new mongoose.Schema(
  {
    complaintNumber: { type: String, unique: true, sparse: true }, // e.g. CMP-71705289

    title:       { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ['Roads', 'Water', 'Electricity', 'Sanitation', 'Other'],
      default: 'Other',
    },
    urgency: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Low',
    },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Resolved', 'Escalated'],
      default: 'Pending',
    },
    citizen: {
      name:  { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String },
    },
    location: {
      address: { type: String },
      ward:    { type: String },
    },
    assignedTo: { type: String, default: null },
    resolution: { type: String, default: null },
    sla: {
      deadline:    { type: Date },
      escalated:   { type: Boolean, default: false },
      escalatedAt: { type: Date, default: null },
    },
    images:      [imageSchema],
    afterImages: [imageSchema],
  },
  { timestamps: true }
);

// Auto-generate complaintNumber after save
complaintSchema.post('save', async function (doc) {
  if (!doc.complaintNumber) {
    doc.complaintNumber = `CMP-${doc._id.toString().slice(-8).toUpperCase()}`;
    await doc.constructor.updateOne({ _id: doc._id }, { complaintNumber: doc.complaintNumber });
  }
});

const Complaint = mongoose.model('Complaint', complaintSchema);
module.exports = Complaint;