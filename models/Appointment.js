
const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
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
  timeSlot: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
    default: 'confirmed'
  },
  notes: {
    type: String,
    trim: true
  },
  reminderSent: {
    type: Boolean,
    default: false
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
AppointmentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for full appointment datetime
AppointmentSchema.virtual('appointmentDateTime').get(function() {
  const date = new Date(this.date);
  const [hours, minutes] = this.timeSlot.split(':');
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return date;
});

// Indexes for faster queries
AppointmentSchema.index({ userId: 1 });
AppointmentSchema.index({ date: 1, status: 1 });
AppointmentSchema.index({ serviceId: 1, date: 1 });

module.exports = mongoose.model('Appointment', AppointmentSchema);
