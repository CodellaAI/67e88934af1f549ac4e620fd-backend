
const mongoose = require('mongoose');

const WaitlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  preferredTimeSlots: [{
    type: String
  }],
  status: {
    type: String,
    enum: ['waiting', 'notified', 'booked', 'expired'],
    default: 'waiting'
  },
  notifiedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
WaitlistSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for faster queries
WaitlistSchema.index({ userId: 1 });
WaitlistSchema.index({ date: 1, status: 1 });
WaitlistSchema.index({ serviceId: 1, date: 1 });

module.exports = mongoose.model('Waitlist', WaitlistSchema);
