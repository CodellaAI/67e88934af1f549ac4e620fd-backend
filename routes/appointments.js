
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const User = require('../models/User');
const Waitlist = require('../models/Waitlist');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const scheduleUtils = require('../utils/scheduleUtils');
const emailService = require('../utils/emailService');
const smsService = require('../utils/smsService');

// @route   GET api/appointments
// @desc    Get all appointments (admin only)
// @access  Private/Admin
router.get('/', [auth, admin], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const appointments = await Appointment.find()
      .populate('userId', 'firstName lastName email phone')
      .populate('serviceId')
      .sort({ date: 1, timeSlot: 1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Appointment.countDocuments();
    
    res.json({
      appointments,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/appointments/user
// @desc    Get current user's appointments
// @access  Private
router.get('/user', auth, async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.user.id })
      .populate('serviceId')
      .sort({ date: -1 });
    
    // Transform the appointments to include service details
    const formattedAppointments = appointments.map(appointment => {
      return {
        _id: appointment._id,
        date: appointment.date,
        timeSlot: appointment.timeSlot,
        status: appointment.status,
        service: {
          name: appointment.serviceId.name,
          price: appointment.serviceId.price,
          duration: appointment.serviceId.duration
        },
        notes: appointment.notes,
        createdAt: appointment.createdAt
      };
    });
    
    res.json(formattedAppointments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/appointments/:id
// @desc    Get appointment by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('userId', 'firstName lastName email phone')
      .populate('serviceId');
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    // Check if user is authorized to view this appointment
    if (appointment.userId._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    res.json(appointment);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   GET api/appointments/available
// @desc    Get available time slots for a date and service
// @access  Public
router.get('/available', async (req, res) => {
  try {
    const { date, serviceId } = req.query;
    
    if (!date || !serviceId) {
      return res.status(400).json({ message: 'Date and service ID are required' });
    }
    
    const requestedDate = new Date(date);
    
    // Check if date is valid
    if (isNaN(requestedDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }
    
    // Check if date is in the past
    if (requestedDate < new Date().setHours(0, 0, 0, 0)) {
      return res.status(400).json({ message: 'Cannot book appointments in the past' });
    }
    
    // Check if date is a business day
    if (!scheduleUtils.isBusinessDay(requestedDate)) {
      return res.status(400).json({ message: 'Selected date is not a business day' });
    }
    
    // Get service details for duration
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    // Get existing appointments for the date
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const existingAppointments = await Appointment.find({
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: { $nin: ['cancelled', 'no-show'] }
    }).populate('serviceId');
    
    // Format appointments for the availability check
    const formattedAppointments = existingAppointments.map(appointment => ({
      timeSlot: appointment.timeSlot,
      serviceDuration: appointment.serviceId.duration
    }));
    
    // Get available time slots
    const availableSlots = scheduleUtils.getAvailableTimeSlots(
      requestedDate,
      formattedAppointments,
      service.duration
    );
    
    res.json(availableSlots);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/appointments
// @desc    Create a new appointment
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('serviceId', 'Service ID is required').not().isEmpty(),
      check('date', 'Date is required').not().isEmpty(),
      check('timeSlot', 'Time slot is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { serviceId, date, timeSlot, notes, userId } = req.body;
    
    try {
      // Determine which user ID to use (admin can book for other users)
      const bookingUserId = req.user.role === 'admin' && userId ? userId : req.user.id;
      
      // Validate service
      const service = await Service.findById(serviceId);
      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }
      
      // Validate user if admin is booking for someone else
      if (req.user.role === 'admin' && userId) {
        const user = await User.findById(userId);
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
      }
      
      const requestedDate = new Date(date);
      
      // Check if date is valid
      if (isNaN(requestedDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }
      
      // Check if date is in the past
      if (requestedDate < new Date().setHours(0, 0, 0, 0)) {
        return res.status(400).json({ message: 'Cannot book appointments in the past' });
      }
      
      // Check time slot availability
      const startOfDay = new Date(requestedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(requestedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const existingAppointments = await Appointment.find({
        date: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        status: { $nin: ['cancelled', 'no-show'] }
      }).populate('serviceId');
      
      // Format appointments for the availability check
      const formattedAppointments = existingAppointments.map(appointment => ({
        timeSlot: appointment.timeSlot,
        serviceDuration: appointment.serviceId.duration
      }));
      
      // Check if the requested time slot is available
      const isAvailable = scheduleUtils.isTimeSlotAvailable(
        timeSlot,
        formattedAppointments,
        service.duration
      );
      
      if (!isAvailable) {
        return res.status(400).json({ message: 'The selected time slot is no longer available' });
      }
      
      // Create new appointment
      const newAppointment = new Appointment({
        userId: bookingUserId,
        serviceId,
        date: requestedDate,
        timeSlot,
        notes
      });
      
      const appointment = await newAppointment.save();
      
      // Add loyalty points to user
      if (service.loyaltyPointsEarned > 0) {
        await User.findByIdAndUpdate(
          bookingUserId,
          { $inc: { loyaltyPoints: service.loyaltyPointsEarned } }
        );
      }
      
      // Send confirmation email and SMS
      const user = await User.findById(bookingUserId);
      
      if (user.preferences.emailNotifications) {
        emailService.sendAppointmentConfirmation(user, appointment, service);
      }
      
      if (user.preferences.smsNotifications) {
        smsService.sendAppointmentConfirmationSMS(user, appointment, service);
      }
      
      // Check waitlist and update if needed
      await updateWaitlistForDate(requestedDate);
      
      res.json(appointment);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   PUT api/appointments/:id
// @desc    Update an appointment
// @access  Private
router.put(
  '/:id',
  [
    auth,
    [
      check('status', 'Status is required').isIn(['pending', 'confirmed', 'cancelled', 'completed', 'no-show'])
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { status, notes } = req.body;
    
    try {
      let appointment = await Appointment.findById(req.params.id);
      
      if (!appointment) {
        return res.status(404).json({ message: 'Appointment not found' });
      }
      
      // Check if user is authorized to update this appointment
      if (appointment.userId.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' });
      }
      
      // Update fields
      appointment.status = status;
      if (notes) appointment.notes = notes;
      appointment.updatedAt = Date.now();
      
      await appointment.save();
      
      // If appointment was cancelled, check waitlist
      if (status === 'cancelled') {
        await updateWaitlistForDate(appointment.date);
      }
      
      res.json(appointment);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Appointment not found' });
      }
      res.status(500).send('Server error');
    }
  }
);

// @route   PUT api/appointments/:id/reschedule
// @desc    Reschedule an appointment
// @access  Private
router.put(
  '/:id/reschedule',
  [
    auth,
    [
      check('date', 'Date is required').not().isEmpty(),
      check('timeSlot', 'Time slot is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { date, timeSlot } = req.body;
    
    try {
      let appointment = await Appointment.findById(req.params.id)
        .populate('serviceId');
      
      if (!appointment) {
        return res.status(404).json({ message: 'Appointment not found' });
      }
      
      // Check if user is authorized to update this appointment
      if (appointment.userId.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' });
      }
      
      const requestedDate = new Date(date);
      
      // Check if date is valid
      if (isNaN(requestedDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }
      
      // Check if date is in the past
      if (requestedDate < new Date().setHours(0, 0, 0, 0)) {
        return res.status(400).json({ message: 'Cannot book appointments in the past' });
      }
      
      // Check time slot availability
      const startOfDay = new Date(requestedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(requestedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const existingAppointments = await Appointment.find({
        _id: { $ne: appointment._id }, // Exclude current appointment
        date: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        status: { $nin: ['cancelled', 'no-show'] }
      }).populate('serviceId');
      
      // Format appointments for the availability check
      const formattedAppointments = existingAppointments.map(appointment => ({
        timeSlot: appointment.timeSlot,
        serviceDuration: appointment.serviceId.duration
      }));
      
      // Check if the requested time slot is available
      const isAvailable = scheduleUtils.isTimeSlotAvailable(
        timeSlot,
        formattedAppointments,
        appointment.serviceId.duration
      );
      
      if (!isAvailable) {
        return res.status(400).json({ message: 'The selected time slot is no longer available' });
      }
      
      // Store old date for waitlist check
      const oldDate = new Date(appointment.date);
      
      // Update appointment
      appointment.date = requestedDate;
      appointment.timeSlot = timeSlot;
      appointment.updatedAt = Date.now();
      
      await appointment.save();
      
      // Send notification to user
      const user = await User.findById(appointment.userId);
      
      if (user.preferences.emailNotifications) {
        emailService.sendAppointmentConfirmation(user, appointment, appointment.serviceId);
      }
      
      if (user.preferences.smsNotifications) {
        smsService.sendAppointmentConfirmationSMS(user, appointment, appointment.serviceId);
      }
      
      // Check waitlist for both old and new dates
      await updateWaitlistForDate(oldDate);
      await updateWaitlistForDate(requestedDate);
      
      res.json(appointment);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Appointment not found' });
      }
      res.status(500).send('Server error');
    }
  }
);

// @route   DELETE api/appointments/:id
// @desc    Cancel an appointment
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    // Check if user is authorized to cancel this appointment
    if (appointment.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Check if appointment is in the past
    if (new Date(appointment.date) < new Date()) {
      return res.status(400).json({ message: 'Cannot cancel past appointments' });
    }
    
    // Update appointment status to cancelled
    appointment.status = 'cancelled';
    appointment.updatedAt = Date.now();
    
    await appointment.save();
    
    // Check waitlist
    await updateWaitlistForDate(appointment.date);
    
    res.json({ message: 'Appointment cancelled' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   GET api/appointments/waitlist
// @desc    Get waitlist for a date (admin only)
// @access  Private/Admin
router.get('/waitlist', [auth, admin], async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }
    
    const requestedDate = new Date(date);
    
    // Check if date is valid
    if (isNaN(requestedDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }
    
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const waitlist = await Waitlist.find({
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: 'waiting'
    })
      .populate('userId', 'firstName lastName email phone')
      .populate('serviceId')
      .sort({ createdAt: 1 });
    
    res.json(waitlist);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/appointments/waitlist
// @desc    Join waitlist for a date
// @access  Private
router.post(
  '/waitlist',
  [
    auth,
    [
      check('date', 'Date is required').not().isEmpty(),
      check('serviceId', 'Service ID is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { date, serviceId, preferredTimeSlots } = req.body;
    
    try {
      const requestedDate = new Date(date);
      
      // Check if date is valid
      if (isNaN(requestedDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }
      
      // Check if date is in the past
      if (requestedDate < new Date().setHours(0, 0, 0, 0)) {
        return res.status(400).json({ message: 'Cannot join waitlist for past dates' });
      }
      
      // Check if service exists
      const service = await Service.findById(serviceId);
      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }
      
      // Check if user is already on waitlist for this date and service
      const existingWaitlist = await Waitlist.findOne({
        userId: req.user.id,
        serviceId,
        date: {
          $gte: new Date(requestedDate).setHours(0, 0, 0, 0),
          $lte: new Date(requestedDate).setHours(23, 59, 59, 999)
        },
        status: 'waiting'
      });
      
      if (existingWaitlist) {
        return res.status(400).json({ message: 'You are already on the waitlist for this date and service' });
      }
      
      // Create new waitlist entry
      const newWaitlist = new Waitlist({
        userId: req.user.id,
        serviceId,
        date: requestedDate,
        preferredTimeSlots: preferredTimeSlots || []
      });
      
      const waitlist = await newWaitlist.save();
      
      res.json(waitlist);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// Helper function to update waitlist when slots become available
async function updateWaitlistForDate(date) {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Get waitlist entries for the date
    const waitlistEntries = await Waitlist.find({
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: 'waiting'
    })
      .populate('userId')
      .populate('serviceId')
      .sort({ createdAt: 1 });
    
    if (waitlistEntries.length === 0) {
      return;
    }
    
    // Get existing appointments for the date
    const existingAppointments = await Appointment.find({
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: { $nin: ['cancelled', 'no-show'] }
    }).populate('serviceId');
    
    // Format appointments for the availability check
    const formattedAppointments = existingAppointments.map(appointment => ({
      timeSlot: appointment.timeSlot,
      serviceDuration: appointment.serviceId.duration
    }));
    
    // Check available slots for each waitlist entry
    for (const entry of waitlistEntries) {
      // Get available time slots for this service
      const availableSlots = scheduleUtils.getAvailableTimeSlots(
        date,
        formattedAppointments,
        entry.serviceId.duration
      );
      
      if (availableSlots.length > 0) {
        // Find a preferred time slot if specified
        let selectedSlot = availableSlots[0]; // Default to first available
        
        if (entry.preferredTimeSlots && entry.preferredTimeSlots.length > 0) {
          for (const preferredSlot of entry.preferredTimeSlots) {
            if (availableSlots.includes(preferredSlot)) {
              selectedSlot = preferredSlot;
              break;
            }
          }
        }
        
        // Update waitlist entry status
        entry.status = 'notified';
        entry.notifiedAt = Date.now();
        await entry.save();
        
        // Notify user
        if (entry.userId.preferences.emailNotifications) {
          // Send email notification
        }
        
        if (entry.userId.preferences.smsNotifications) {
          smsService.sendWaitlistNotificationSMS(
            entry.userId,
            entry.serviceId,
            date,
            selectedSlot
          );
        }
      }
    }
  } catch (err) {
    console.error('Error updating waitlist:', err);
  }
}

module.exports = router;
