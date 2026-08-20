const BookingSettings = require('../models/BookingSettings');
const Appointment = require('../models/Appointment');

const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Get (or lazily create) the workspace booking settings.
async function getSettings(workspaceId) {
  let s = await BookingSettings.findOne({ workspace: workspaceId });
  if (!s) s = await BookingSettings.create({ workspace: workspaceId, slug: genSlug() });
  else if (!s.slug) { s.slug = genSlug(); await s.save(); }
  return s;
}

function genSlug() {
  return 'wp' + Math.random().toString(36).slice(2, 9);
}

// Resolve the effective windows for a given date, honouring per-date overrides.
function windowsForDate(settings, dateStr) {
  const ov = (settings.overrides || []).find((o) => o.date === dateStr);
  if (ov) return ov.unavailable ? [] : (ov.windows || []);
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  return (settings.weekly && settings.weekly[weekday]) || [];
}

// Build all candidate slots from a set of {start,end} windows.
function slotsFromWindows(windows, slotDuration) {
  const dur = Math.max(5, slotDuration || 30);
  const out = [];
  for (const w of windows || []) {
    let s = toMin(w.start);
    const e = toMin(w.end);
    while (s + dur <= e) {
      out.push({ start: toHHMM(s), end: toHHMM(s + dur) });
      s += dur;
    }
  }
  return out;
}

// Back-compat: candidate slots for a weekday from the weekly windows.
function candidateSlots(settings, weekday) {
  return slotsFromWindows((settings.weekly && settings.weekly[weekday]) || [], settings.slotDuration);
}

// Available slots for a date string 'YYYY-MM-DD', subtracting booked capacity.
async function slotsForDate(workspaceId, settings, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return [];
  const cands = slotsFromWindows(windowsForDate(settings, dateStr), settings.slotDuration);
  if (!cands.length) return [];

  const dayStart = new Date(dateStr + 'T00:00:00');
  const dayEnd = new Date(dateStr + 'T23:59:59');
  const booked = await Appointment.find({
    workspace: workspaceId,
    date: { $gte: dayStart, $lte: dayEnd },
    status: { $nin: ['cancelled'] },
  }).select('startTime').lean();
  const counts = {};
  for (const b of booked) counts[b.startTime] = (counts[b.startTime] || 0) + 1;

  const cap = Math.max(1, settings.maxPerSlot || 1);
  const now = new Date();
  return cands.map((c) => {
    const used = counts[c.start] || 0;
    const slotDateTime = new Date(dateStr + 'T' + c.start + ':00');
    const past = slotDateTime.getTime() < now.getTime();
    return { start: c.start, end: c.end, capacity: cap, remaining: Math.max(0, cap - used), available: !past && used < cap };
  }).filter((s) => !s || true);
}

// Verify a specific slot is bookable (weekday window + capacity). Returns {ok, end, message}.
async function verifySlot(workspaceId, settings, dateStr, startTime) {
  const slots = await slotsForDate(workspaceId, settings, dateStr);
  const slot = slots.find((s) => s.start === startTime);
  if (!slot) return { ok: false, message: 'Selected time is not an available slot.' };
  if (!slot.available) return { ok: false, message: 'This slot is no longer available.' };
  return { ok: true, end: slot.end };
}

// Resolve the panel's configured SMTP: prefer the workspace Email Channel
// (Channels page), fall back to the system SMTP (Admin → Email settings).
async function resolveSmtp(workspaceId) {
  const Workspace = require('../models/Workspace');
  const ws = await Workspace.findById(workspaceId).select('emailChannel').lean();
  const ec = (ws && ws.emailChannel) || {};
  if (ec.enabled && ec.smtpHost && ec.user) {
    return { host: ec.smtpHost, port: ec.smtpPort || 587, user: ec.user, pass: ec.pass, fromName: ec.fromName || '' };
  }
  const SystemSettings = require('../models/SystemSettings');
  const ss = await SystemSettings.findOne().select('smtp appName').lean();
  const sm = (ss && ss.smtp) || {};
  if (sm.host && sm.user) {
    return { host: sm.host, port: sm.port || 587, user: sm.user, pass: sm.pass, fromName: sm.fromName || sm.from || (ss && ss.appName) || '' };
  }
  return null;
}

// Notify the configured addresses that a new appointment was booked.
// Fire-and-forget: never let email failure break the booking.
async function notifyBooking(settings, appt) {
  try {
    const emails = (settings && settings.notificationEmails || []).filter((e) => e && e.includes('@'));
    if (!emails.length) return;
    const smtp = await resolveSmtp(appt.workspace);
    if (!smtp) {
      console.warn('[booking] notify email skipped: SMTP not configured (set it on Channels page or Admin → Email) for workspace', String(appt.workspace));
      return;
    }
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    });
    const dateStr = appt.date ? new Date(appt.date).toLocaleDateString('en-IN', { timeZone: settings.timezone || 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const rows = [
      ['Name', appt.contactName || (appt.contact && appt.contact.name) || '—'],
      ['Phone', appt.contactPhone || '—'],
      ['Email', appt.contactEmail || '—'],
      ['Date', dateStr],
      ['Time', `${appt.startTime || ''}${appt.endTime ? ' - ' + appt.endTime : ''}`],
      ['Notes', appt.notes || '—'],
    ];
    const html = `<h2>New appointment booked</h2>
      <table cellpadding="6" style="border-collapse:collapse">
      ${rows.map(([k, v]) => `<tr><td style="color:#555"><b>${k}</b></td><td>${String(v)}</td></tr>`).join('')}
      </table>`;
    await transporter.sendMail({
      from: smtp.fromName ? `"${smtp.fromName}" <${smtp.user}>` : smtp.user,
      to: emails.join(','),
      subject: `New appointment booked — ${dateStr} ${appt.startTime || ''}`.trim(),
      html,
      text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
    });
    console.log('[booking] notify email sent to', emails.join(','));
  } catch (e) {
    console.error('[booking] notify email failed:', e.message);
  }
}

module.exports = { getSettings, slotsForDate, verifySlot, candidateSlots, slotsFromWindows, windowsForDate, genSlug, notifyBooking };
