const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
  }

  // Resolve SMTP config from explicit config, then env, then the panel's own
  // SystemSettings (many self-hosted panels configure SMTP in Admin, not env).
  async resolveConfig(config) {
    const c = config || {};
    let host = c.host || process.env.SMTP_HOST;
    let port = c.port || process.env.SMTP_PORT;
    let user = c.user || process.env.SMTP_USER;
    let pass = c.pass || process.env.SMTP_PASS;
    let fromName = '';
    let appName = '';
    if (!host || !user) {
      try {
        const SystemSettings = require('../models/SystemSettings');
        const s = await SystemSettings.findOne().select('appName smtp').lean();
        const sm = (s && s.smtp) || {};
        appName = (s && s.appName && s.appName !== 'Wapto') ? s.appName : '';
        fromName = sm.fromName || '';
        if (sm.host && sm.user) { host = sm.host; port = sm.port; user = sm.user; pass = sm.pass; }
      } catch (e) { /* ignore */ }
    }
    return { host, port: parseInt(port, 10) || 587, user, pass, fromName, appName };
  }

  async initialize(config) {
    const cfg = await this.resolveConfig(config);
    this.cfg = cfg;
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      family: 4,
      auth: { user: cfg.user, pass: cfg.pass },
      tls: { rejectUnauthorized: false },
    });
  }

  // Resolve the panel's own brand name for white-label email headers/copy.
  async brandName() {
    try {
      const SystemSettings = require('../models/SystemSettings');
      const s = await SystemSettings.findOne().select('appName smtp').lean();
      const fromName = s && s.smtp && s.smtp.fromName;
      if (fromName) return fromName;
      if (s && s.appName && s.appName !== 'Wapto') return s.appName;
    } catch (e) { /* fall through to generic */ }
    return '';
  }

  async sendEmail({ to, subject, html, text, from }) {
    if (!this.transporter) {
      await this.initialize({});
    }
    const cfg = this.cfg || {};
    const smtpUser = cfg.user || process.env.SMTP_USER;

    let fromHeader = from || process.env.SMTP_FROM;
    if (!fromHeader) {
      const brand = (await this.brandName()) || cfg.fromName || cfg.appName;
      fromHeader = brand ? `"${brand}" <${smtpUser}>` : smtpUser;
    }

    const mailOptions = {
      from: fromHeader,
      to,
      subject,
      html,
      text,
    };

    return this.transporter.sendMail(mailOptions);
  }

  async sendWelcomeEmail(user) {
    const brand = (await this.brandName()) || 'our platform';
    return this.sendEmail({
      to: user.email,
      subject: `Welcome to ${brand}!`,
      html: `
        <h2>Welcome, ${user.name}!</h2>
        <p>Your account has been created successfully on ${brand}.</p>
        <p>You can now login and start using our WhatsApp Business API platform.</p>
      `,
    });
  }

  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    return this.sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset</h2>
        <p>You requested a password reset. Click the link below:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link expires in 1 hour.</p>
      `,
    });
  }
}

module.exports = new EmailService();
