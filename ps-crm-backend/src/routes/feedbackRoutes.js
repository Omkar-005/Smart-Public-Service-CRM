const express = require('express');
const router = express.Router();
const { submitFeedback, getAllFeedback, getComplaintFeedback } = require('../controllers/feedbackController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public - citizens submit feedback
router.post('/', protect, submitFeedback);

// Admin only - view all feedback
router.get('/', protect, adminOnly, getAllFeedback);

// Get feedback for specific complaint
router.get('/:complaintId', protect, getComplaintFeedback);

module.exports = router;