const nodemailer = require('nodemailer');
const SystemSettings = require('../models/SystemSettings');

const render = (str, vars) => String(str || '').replace(/{{\s*(\w+)\s*}}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));

// Built-in fallbacks so critical emails still send on panels whose stored
// SystemSettings pre-dates these template keys (older docs miss them entirely).
const DEFAULT_TEMPLATES = {
  passwordReset: {
    subject: 'Password Reset - {{appName}}',
    body: '<h2>Password Reset Request</h2><p>Hi {{userName}},</p><p>You requested a password reset. Click the link below to reset your password:</p><p><a href="{{resetLink}}" style="background:#10B981;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Reset Password</a></p><p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>',
  },
  emailVerification: {
    subject: 'Verify Your Email - {{appName}}',
    body: '<h2>Email Verification</h2><p>Hi {{userName}},</p><p>Please verify your email address by clicking the link below:</p><p><a href="{{verifyLink}}" style="background:#10B981;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Verify Email</a></p>',
  },
};

// Resolve the effective SMTP config: admin-configured (DB) takes priority,
// otherwise fall back to environment variables so a default sender can be
// provisioned at the .env level (e.g. by the installer / white-label owner).
const resolveSmtp = (settings) => {
  const dbSmtp = settings?.smtp;
  if (dbSmtp?.host && dbSmtp?.user) return dbSmtp;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      fromName: process.env.SMTP_FROM_NAME || '',
      encryption: process.env.SMTP_ENCRYPTION || '',
    };
  }
  return null;
};

// Build a nodemailer transport from the resolved SMTP config. Forces IPv4
// (family: 4) because some hosts have no IPv6 route and Node otherwise resolves
// smtp hosts to an AAAA record first -> ENETUNREACH. secure is derived from the
// port (465 = implicit SSL, 587/others = STARTTLS) so a mismatched stored
// encryption flag can't break the handshake.
const buildTransport = (smtp) => {
  const port = smtp.port || 587;
  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure: port === 465,
    family: 4,
    auth: { user: smtp.user, pass: smtp.pass },
  });
};

// Sends a system email using an admin-configured template.
// Returns true when sent, false when the template is disabled or SMTP is not configured.
const sendTemplateEmail = async (templateKey, to, vars = {}) => {
  const settings = await SystemSettings.findOne().lean();
  const smtp = resolveSmtp(settings);
  if (!smtp?.host || !smtp?.user) return false;
  let tpl = settings?.emailTemplates?.[templateKey];
  if (tpl && tpl.enabled === false) return false; // admin explicitly disabled it
  // Fall back to a built-in default when the stored settings lack this template.
  if (!tpl || !tpl.subject || !tpl.body) {
    const def = DEFAULT_TEMPLATES[templateKey];
    if (!def) return false;
    tpl = { subject: tpl?.subject || def.subject, body: tpl?.body || def.body };
  }

  const allVars = {
    appName: settings?.appName || 'WabaPanel',
    appUrl: settings?.appUrl || '',
    ...vars,
  };

  const transporter = buildTransport(smtp);

  await transporter.sendMail({
    from: smtp.fromName ? `"${smtp.fromName}" <${smtp.from || smtp.user}>` : (smtp.from || smtp.user),
    to,
    subject: render(tpl.subject, allVars),
    html: render(tpl.body, allVars),
  });
  return true;
};

// Sends an email directly (no admin template), used for system codes like 2FA OTP.
// Returns true when sent, false when SMTP is not configured.
const sendRawEmail = async (to, subject, html) => {
  const settings = await SystemSettings.findOne().lean();
  const smtp = resolveSmtp(settings);
  if (!smtp?.host || !smtp?.user) return false;

  const transporter = buildTransport(smtp);

  await transporter.sendMail({
    from: smtp.fromName ? `"${smtp.fromName}" <${smtp.from || smtp.user}>` : (smtp.from || smtp.user),
    to,
    subject,
    html,
  });
  return true;
};

// Whether a given email template is enabled in admin settings.
const isTemplateEnabled = async (templateKey) => {
  const settings = await SystemSettings.findOne().lean();
  const tpl = settings?.emailTemplates?.[templateKey];
  const smtp = resolveSmtp(settings);
  if (tpl && tpl.enabled === false) return false;
  const hasTemplate = !!(tpl && tpl.subject && tpl.body) || !!DEFAULT_TEMPLATES[templateKey];
  return !!(hasTemplate && smtp?.host && smtp?.user);
};

module.exports = { sendTemplateEmail, sendRawEmail, isTemplateEnabled };
