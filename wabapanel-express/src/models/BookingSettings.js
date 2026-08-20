const mongoose = require('mongoose');

const windowSchema = new mongoose.Schema({
  start: { type: String, required: true }, // 'HH:MM'
  end: { type: String, required: true },   // 'HH:MM'
}, { _id: false });

// Per-date exception to the weekly hours. unavailable=true blocks the whole day;
// otherwise `windows` replace the weekly windows for that date.
const overrideSchema = new mongoose.Schema({
  date: { type: String, required: true },   // 'YYYY-MM-DD'
  unavailable: { type: Boolean, default: false },
  windows: { type: [windowSchema], default: [] },
}, { _id: false });

// weekly[0]=Sunday .. weekly[6]=Saturday, each an array of {start,end} windows
const defaultWeekly = () => [
  [],
  [{ start: '10:00', end: '18:00' }],
  [{ start: '10:00', end: '18:00' }],
  [{ start: '10:00', end: '18:00' }],
  [{ start: '10:00', end: '18:00' }],
  [{ start: '10:00', end: '18:00' }],
  [],
];

const bookingSettingsSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  enabled: { type: Boolean, default: false },
  slug: { type: String, index: true },
  title: { type: String, default: 'Book an Appointment' },
  description: { type: String, default: '' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  slotDuration: { type: Number, default: 30 },     // minutes per slot
  maxPerSlot: { type: Number, default: 1 },         // how many can book the same slot
  advanceDays: { type: Number, default: 30 },       // how far ahead bookings allowed
  weekly: { type: [[windowSchema]], default: defaultWeekly },
  overrides: { type: [overrideSchema], default: [] },
  notificationEmails: { type: [String], default: [] }, // emailed on every new booking
}, { timestamps: true });

module.exports = mongoose.model('BookingSettings', bookingSettingsSchema);
