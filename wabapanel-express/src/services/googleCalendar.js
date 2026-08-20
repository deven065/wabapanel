// Creates Google Calendar events for appointments via a service account.
const axios = require('axios');
const jwt = require('jsonwebtoken');

async function getToken(saJson) {
  const sa = typeof saJson === 'string' ? JSON.parse(saJson) : saJson;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }, sa.private_key, { algorithm: 'RS256' });
  const r = await axios.post('https://oauth2.googleapis.com/token',
    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return r.data.access_token;
}

// Fire-and-forget safe: creates a calendar event for a newly booked appointment.
async function createEventForAppointment(appt) {
  try {
    const Integration = require('../models/Integration');
    const integ = await Integration.findOne({ workspace: appt.workspace, type: 'google-calendar', connected: true }).lean();
    if (!integ?.config?.apiKey || !integ?.config?.calendarId) return;
    const token = await getToken(integ.config.apiKey);
    const dateStr = new Date(appt.date).toISOString().slice(0, 10);
    const start = `${dateStr}T${appt.startTime || '10:00'}:00`;
    const end = `${dateStr}T${appt.endTime || appt.startTime || '10:30'}:00`;
    const event = {
      summary: appt.title || 'Appointment',
      description: `Customer: ${appt.contactName || ''} ${appt.contactPhone || ''}${appt.contactEmail ? ' ' + appt.contactEmail : ''}\n${appt.notes || ''}`.trim(),
      start: { dateTime: start, timeZone: 'Asia/Kolkata' },
      end: { dateTime: end, timeZone: 'Asia/Kolkata' },
    };
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(integ.config.calendarId)}/events`;
    if (appt.contactEmail) {
      // Email invite to the customer; service accounts without domain-wide
      // delegation can't invite attendees, so fall back to a plain event.
      try {
        await axios.post(`${url}?sendUpdates=all`,
          { ...event, attendees: [{ email: appt.contactEmail }] },
          { headers: { Authorization: `Bearer ${token}` } });
        console.log('[GCal] event + invite created for appointment', String(appt._id));
        return;
      } catch (e) {
        console.error('[GCal] invite failed, creating plain event:', e.response?.data?.error?.message || e.message);
      }
    }
    await axios.post(url, event, { headers: { Authorization: `Bearer ${token}` } });
    console.log('[GCal] event created for appointment', String(appt._id));
  } catch (e) {
    console.error('[GCal] event create failed:', e.response?.data?.error?.message || e.message);
  }
}

module.exports = { createEventForAppointment };
