const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  // General
  appName: { type: String, default: 'Wapto' },
  appEmail: { type: String, default: '' },
  appDescription: { type: String, default: '' },
  appUrl: { type: String, default: '' },
  theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
  primaryColor: { type: String, default: '#059669' },
  primaryFont: { type: String, default: 'Inter' },
  siteTheme: { type: String, default: 'royal-violet' },
  contactCaptcha: { type: Boolean, default: false },
  sessionTimeout: { type: Number, default: 60 }, // minutes

  // Branding
  logo: { type: String, default: '' },
  logoDark: { type: String, default: '' },
  favicon: { type: String, default: '' },
  loginBg: { type: String, default: '' },
  tagline: { type: String, default: 'by KKHS Media' },

  // Invoice / Company details
  invoice: {
    companyName: { type: String, default: '' },
    address: { type: String, default: '' },
    gstin: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    footerNote: { type: String, default: '' },
  },

  // WhatsApp
  whatsapp: {
    apiUrl: { type: String, default: 'https://graph.facebook.com/v21.0' },
    apiVersion: { type: String, default: 'v21.0' },
    appId: { type: String, default: '' },
    appSecret: { type: String, default: '' },
    verifyToken: { type: String, default: '' },
    configId: { type: String, default: '' },
    businessId: { type: String, default: '' },
    webhookUrl: { type: String, default: '' },
    webhookVerifyToken: { type: String, default: '' },
    enableEmbeddedSignup: { type: Boolean, default: false },
    enableManualSignup: { type: Boolean, default: true },
    enableCoexistence: { type: Boolean, default: false },
  },

  // Floating WhatsApp chat widget (public landing page)
  whatsappWidget: {
    enabled: { type: Boolean, default: false },
    phone: { type: String, default: '' },
    message: { type: String, default: 'Hi! I have a question.' },
    greeting: { type: String, default: 'Need help? Chat with us' },
  },

  // Facebook
  facebook: {
    appId: { type: String, default: '' },
    appSecret: { type: String, default: '' },
    leadWebhookUrl: { type: String, default: '' },
    configId: { type: String, default: '' },
    enableOneClick: { type: Boolean, default: false },
  },

  // Instagram Auto DM add-on (one-click connect uses the Facebook app above).
  instagram: {
    configId: { type: String, default: '' },
    enableOneClick: { type: Boolean, default: false },
    enableManual: { type: Boolean, default: true },
  },
  // Per-panel add-on licenses (controlled by the store). Missing/false = not licensed.
  addons: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Email SMTP
  smtp: {
    host: { type: String, default: '' },
    port: { type: Number, default: 587 },
    user: { type: String, default: '' },
    pass: { type: String, default: '' },
    from: { type: String, default: '' },
    fromName: { type: String, default: '' },
    encryption: { type: String, enum: ['tls', 'ssl', 'none'], default: 'tls' },
  },

  // Email Templates
  emailTemplates: {
    welcome: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Welcome to {{appName}}!' }, body: { type: String, default: '<h2>Welcome, {{userName}}!</h2><p>Your account has been created successfully on <strong>{{appName}}</strong>.</p><p>You can now login and start using our WhatsApp Business API platform.</p><p>Login: <a href="{{appUrl}}">{{appUrl}}</a></p>' } },
    passwordReset: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Password Reset - {{appName}}' }, body: { type: String, default: '<h2>Password Reset Request</h2><p>Hi {{userName}},</p><p>You requested a password reset. Click the link below to reset your password:</p><p><a href="{{resetLink}}" style="background:#10B981;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Reset Password</a></p><p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>' } },
    emailVerification: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Verify Your Email - {{appName}}' }, body: { type: String, default: '<h2>Email Verification</h2><p>Hi {{userName}},</p><p>Please verify your email address by clicking the link below:</p><p><a href="{{verifyLink}}" style="background:#10B981;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Verify Email</a></p>' } },
    invoicePayment: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Payment Received - {{appName}}' }, body: { type: String, default: '<h2>Payment Confirmation</h2><p>Hi {{userName}},</p><p>We have received your payment of <strong>{{amount}}</strong>.</p><p>Plan: {{planName}}<br/>Transaction ID: {{transactionId}}<br/>Date: {{paymentDate}}</p><p>Thank you for your purchase!</p>' } },
    planUpgrade: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Plan Upgraded - {{appName}}' }, body: { type: String, default: '<h2>Plan Upgrade Successful</h2><p>Hi {{userName}},</p><p>Your plan has been upgraded to <strong>{{planName}}</strong>.</p><p>You now have access to all features included in your new plan.</p>' } },
    planExpiry: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Plan Expiring Soon - {{appName}}' }, body: { type: String, default: '<h2>Plan Expiry Reminder</h2><p>Hi {{userName}},</p><p>Your <strong>{{planName}}</strong> plan will expire on <strong>{{expiryDate}}</strong>.</p><p>Renew now to continue using all features without interruption.</p><p><a href="{{appUrl}}" style="background:#10B981;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Renew Now</a></p>' } },
    accountDeactivation: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Account Deactivated - {{appName}}' }, body: { type: String, default: '<h2>Account Deactivated</h2><p>Hi {{userName}},</p><p>Your account on <strong>{{appName}}</strong> has been deactivated.</p><p>If you think this was a mistake, please contact our support team.</p>' } },
    loginAlert: { enabled: { type: Boolean, default: false }, subject: { type: String, default: 'New Login Detected - {{appName}}' }, body: { type: String, default: '<h2>New Login Detected</h2><p>Hi {{userName}},</p><p>A new login was detected on your account.</p><p>IP: {{ipAddress}}<br/>Time: {{loginTime}}<br/>Device: {{deviceInfo}}</p><p>If this was not you, please change your password immediately.</p>' } },
    walletTopup: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'Wallet Credited - {{appName}}' }, body: { type: String, default: '<h2>Wallet Top-up Successful</h2><p>Hi {{userName}},</p><p>Your wallet has been credited with <strong>{{amount}}</strong>.</p><p>New Balance: {{newBalance}}</p>' } },
    contactForm: { enabled: { type: Boolean, default: true }, subject: { type: String, default: 'New Contact Form Submission - {{appName}}' }, body: { type: String, default: '<h2>New Contact Form Submission</h2><p>Name: {{contactName}}<br/>Email: {{contactEmail}}<br/>Phone: {{contactPhone}}<br/>Message: {{contactMessage}}</p>' } },
  },

  // Google
  google: {
    clientId: { type: String, default: '' },
    clientSecret: { type: String, default: '' },
    apiKey: { type: String, default: '' },
  },

  // AWS S3
  aws: {
    accessKeyId: { type: String, default: '' },
    secretAccessKey: { type: String, default: '' },
    region: { type: String, default: 'ap-south-1' },
    bucket: { type: String, default: '' },
  },

  // Limits
  limits: {
    maxFileSize: { type: Number, default: 16 }, // MB
    maxGroupMembers: { type: Number, default: 256 },
  },

  // Wallet / Meta billing
  wallet: {
    isEnabled: { type: Boolean, default: true },
    minTopup: { type: Number, default: 100 },
    defaultMarkup: { type: Number, default: 15 }, // percentage
    ratePerMessage: { type: Number, default: 0 }, // legacy flat rate (unused)
    templateRates: {
      marketing: { type: Number, default: 0 },
      utility: { type: Number, default: 0 },
      authentication: { type: Number, default: 0 },
    },
    currency: { type: String, default: 'INR' },
  },

  // Maintenance
  maintenance: {
    isEnabled: { type: Boolean, default: false },
    message: { type: String, default: 'We are currently under maintenance. Please check back later.' },
  },

  // AI Configuration
  ai: {
    providers: [{
      name: { type: String }, // openai, deepseek, xai, gemini
      displayName: { type: String },
      model: { type: String },
      apiKey: { type: String, default: '' },
      baseUrl: { type: String, default: '' },
      isActive: { type: Boolean, default: false },
    }],
    defaultProvider: { type: String, default: 'openai' },
  },

  // Languages
  languages: [{
    code: { type: String },
    name: { type: String },
    nativeName: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  }],

  // Currency
  currencies: [{
    code: { type: String },
    name: { type: String },
    symbol: { type: String },
    rate: { type: Number, default: 0 }, // units of this currency per 1 base (INR); used for exchange-rate pricing
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  }],

  // Per-gateway "accept international / foreign currency" switch. Map of
  // gateway id -> boolean. Only gateways enabled here are shown to customers
  // paying in a non-base (foreign) currency.
  gatewayInternational: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Reusable Razorpay plan ids for wallet auto top-up, keyed by amount (in paise)
  // so the same top-up amount reuses one plan instead of creating a new one each time.
  walletTopupPlanIds: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Tax
  taxes: [{
    name: { type: String },
    rate: { type: Number },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  }],

  // Payment Gateways
  paymentGateways: {
    stripe: {
      isActive: { type: Boolean, default: false },
      publishableKey: { type: String, default: '' },
      secretKey: { type: String, default: '' },
      webhookSecret: { type: String, default: '' },
    },
    razorpay: {
      isActive: { type: Boolean, default: false },
      keyId: { type: String, default: '' },
      keySecret: { type: String, default: '' },
      webhookSecret: { type: String, default: '' },
      autoRenewEnabled: { type: Boolean, default: true },
    },
    paypal: {
      isActive: { type: Boolean, default: false },
      clientId: { type: String, default: '' },
      clientSecret: { type: String, default: '' },
      mode: { type: String, enum: ['sandbox', 'live'], default: 'sandbox' },
    },
    paytm: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    phonepe: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    cashfree: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    payu: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    instamojo: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    paystack: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    flutterwave: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    payoneer: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    mollie: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    square: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    twocheckout: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    braintree: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    authorizenet: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    mercadopago: { isActive: { type: Boolean, default: false }, publicKey: { type: String, default: '' }, secretKey: { type: String, default: '' }, webhookSecret: { type: String, default: '' }, mode: { type: String, default: 'live' } },
    manual: {
      isActive: { type: Boolean, default: false },
      instructions: { type: String, default: '' },
      upiId: { type: String, default: '' },
      qrImageUrl: { type: String, default: '' },
      accountDetails: { type: String, default: '' },
    },
  },

  // KKHS License Control
  kkhsLicenseKey: { type: String, default: "" },
  kkhsDomain: { type: String, default: "" },
  kkhsIsActive: { type: Boolean, default: false },
  kkhsKillSwitch: { type: Boolean, default: false },
  kkhsLicenseData: { type: Object, default: {} },
  kkhsFeatureLocks: { type: Object, default: {} },
  kkhsAddonLocks: { type: Object, default: {} },
  migrations: { type: Object, default: {} },
  kkhsRemoteConfig: { type: Object, default: {} },
  kkhsNotifications: { type: Array, default: [] },
  kkhsAddons: { type: Array, default: [] },
  kkhsLastHeartbeat: { type: Date, default: null },
  kkhsActivatedAt: { type: Date, default: null },
  kkhsDeactivatedAt: { type: Date, default: null },
  kkhsLastPatchVersion: { type: String, default: "" },
  kkhsLastPatchAt: { type: Date, default: null },

  // Plan Auto-Reminder
  planAutoReminder: {
    enabled: { type: Boolean, default: false },
    daysBefore: { type: [Number], default: [7, 3, 1] },
    lastRunAt: { type: Date, default: null },
    sentLog: [{ vendorId: String, sentAt: Date, daysLeft: Number }],
  },

  // Quick Replies
  quickReplies: [{
    title: { type: String },
    message: { type: String },
    shortcut: { type: String },
  }],

  // Automatic data cleanup (daily cron); each category deletes records older than `days`
  dataCleanup: {
    enabled: { type: Boolean, default: false },
    runHour: { type: Number, default: 3 },
    categories: {
      messages: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 180 } },
      callSessions: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 90 } },
      auditLogs: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 90 } },
      scheduledCalls: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 30 } },
      facebookLeads: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 365 } },
      media: { enabled: { type: Boolean, default: false }, days: { type: Number, default: 180 } },
    },
    lastRun: { type: Date },
    lastRunSummary: { type: String, default: '' },
  },
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
