
const twilio = require('twilio');

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Send appointment confirmation SMS
exports.sendAppointmentConfirmationSMS = async (user, appointment, service) => {
  try {
    if (!user.phone) return false;

    const date = new Date(appointment.date);
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    const message = await client.messages.create({
      body: `Hi ${user.firstName}, your appointment for ${service.name} is confirmed for ${formattedDate} at ${appointment.timeSlot}. - Matan Elbaz Barbershop`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: user.phone
    });

    return message.sid ? true : false;
  } catch (error) {
    console.error('Error sending confirmation SMS:', error);
    return false;
  }
};

// Send appointment reminder SMS
exports.sendAppointmentReminderSMS = async (user, appointment, service) => {
  try {
    if (!user.phone) return false;

    const date = new Date(appointment.date);
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    const message = await client.messages.create({
      body: `Reminder: Your appointment for ${service.name} is tomorrow, ${formattedDate} at ${appointment.timeSlot}. - Matan Elbaz Barbershop`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: user.phone
    });

    return message.sid ? true : false;
  } catch (error) {
    console.error('Error sending reminder SMS:', error);
    return false;
  }
};

// Send waitlist notification SMS
exports.sendWaitlistNotificationSMS = async (user, service, date, availableSlot) => {
  try {
    if (!user.phone) return false;

    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    const message = await client.messages.create({
      body: `Good news! A slot for ${service.name} has opened up on ${formattedDate} at ${availableSlot}. Book now: ${process.env.FRONTEND_URL}/booking - Matan Elbaz Barbershop`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: user.phone
    });

    return message.sid ? true : false;
  } catch (error) {
    console.error('Error sending waitlist notification SMS:', error);
    return false;
  }
};
