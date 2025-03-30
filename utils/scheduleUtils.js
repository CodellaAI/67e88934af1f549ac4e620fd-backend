
// Helper functions for scheduling and availability

// Define business hours (24-hour format)
const BUSINESS_HOURS = {
  start: 9, // 9:00 AM
  end: 18,  // 6:00 PM
};

// Time slot interval in minutes
const TIME_SLOT_INTERVAL = 30;

// Generate all possible time slots for a day
exports.generateTimeSlots = () => {
  const slots = [];
  const totalSlots = ((BUSINESS_HOURS.end - BUSINESS_HOURS.start) * 60) / TIME_SLOT_INTERVAL;
  
  for (let i = 0; i < totalSlots; i++) {
    const minutes = i * TIME_SLOT_INTERVAL;
    const hour = Math.floor(minutes / 60) + BUSINESS_HOURS.start;
    const minute = minutes % 60;
    
    slots.push(
      `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    );
  }
  
  return slots;
};

// Check if a time slot is available given existing appointments and service duration
exports.isTimeSlotAvailable = (timeSlot, existingAppointments, serviceDuration) => {
  // Convert time slot to minutes since start of day
  const [hours, minutes] = timeSlot.split(':').map(Number);
  const slotStartMinutes = hours * 60 + minutes;
  const slotEndMinutes = slotStartMinutes + serviceDuration;
  
  // Check if slot is within business hours
  if (hours < BUSINESS_HOURS.start || slotEndMinutes > BUSINESS_HOURS.end * 60) {
    return false;
  }
  
  // Check for conflicts with existing appointments
  for (const appointment of existingAppointments) {
    const [appHours, appMinutes] = appointment.timeSlot.split(':').map(Number);
    const appStartMinutes = appHours * 60 + appMinutes;
    const appEndMinutes = appStartMinutes + appointment.serviceDuration;
    
    // Check for overlap
    if (
      (slotStartMinutes >= appStartMinutes && slotStartMinutes < appEndMinutes) ||
      (slotEndMinutes > appStartMinutes && slotEndMinutes <= appEndMinutes) ||
      (slotStartMinutes <= appStartMinutes && slotEndMinutes >= appEndMinutes)
    ) {
      return false;
    }
  }
  
  return true;
};

// Get available time slots for a specific date and service
exports.getAvailableTimeSlots = (date, existingAppointments, serviceDuration) => {
  const allSlots = this.generateTimeSlots();
  const availableSlots = [];
  
  for (const slot of allSlots) {
    if (this.isTimeSlotAvailable(slot, existingAppointments, serviceDuration)) {
      availableSlots.push(slot);
    }
  }
  
  return availableSlots;
};

// Check if a date is a business day (not weekend or holiday)
exports.isBusinessDay = (date) => {
  const day = date.getDay();
  
  // Check if weekend (0 = Sunday, 6 = Saturday)
  if (day === 0 || day === 6) {
    return false;
  }
  
  // Here you would add logic for holidays
  // For demonstration, we'll just return true for all weekdays
  return true;
};
