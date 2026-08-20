const nodemailer = require('nodemailer');
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');

// Sends a notification email to all super admins. Fire-and-forget safe.
const notifyAdmin = async (subject, lines = [], actionUrl = '') => {
  try {
    const settings = await SystemSettings.findOne().lean();
    const smtp = settings?.smtp;
    if (!smtp?.host || !smtp?.user) return false;

    const admins = await User.find({ role: 'super_admin' }).select('email').lean();
    const to = admins.map(a => a.email).filter(Boolean);
    if (!to.length) return false;

    const appName = settings?.appName || 'WabaPanel';
    const appUrl = settings?.appUrl || 'https://app.wabapanel.com';
    const link = actionUrl ? (actionUrl.startsWith('http') ? actionUrl : appUrl + actionUrl) : '';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:#4f46e5;color:#fff;padding:16px 24px"><h2 style="margin:0;font-size:18px">${appName} — Admin Alert</h2></div>
        <div style="padding:24px">
          <h3 style="margin:0 0 12px;font-size:16px;color:#111827">${subject}</h3>
          ${lines.map(l => `<p style="margin:4px 0;color:#374151;font-size:14px">${l}</p>`).join('')}
          ${link ? `<a href="${link}" style="display:inline-block;margin-top:16px;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">Open in Admin Panel</a>` : ''}
        </div>
      </div>`;

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: (smtp.port || 587) === 465,
      family: 4,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    await transporter.sendMail({
      from: smtp.fromName ? `"${smtp.fromName}" <${smtp.from || smtp.user}>` : (smtp.from || smtp.user),
      to: to.join(','),
      subject: `[${appName}] ${subject}`,
      html,
    });
    return true;
  } catch (e) {
    console.error('[adminNotify]', e.message);
    return false;
  }
};

module.exports = { notifyAdmin };
