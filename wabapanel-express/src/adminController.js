const User = require('../models/User');
const Plan = require('../models/Plan');
const Payment = require('../models/Payment');
const WalletTransaction = require('../models/WalletTransaction');
const MetaPricing = require('../models/MetaPricing');
const SystemSettings = require('../models/SystemSettings');
const Permission = require('../models/Permission');
const LandingPage = require('../models/LandingPage');
const Template = require('../models/Template');
const Inquiry = require('../models/Inquiry');
const ShortLink = require('../models/ShortLink');
const QuickReply = require('../models/QuickReply');
const FAQ = require('../models/FAQ');
const Testimonial = require('../models/Testimonial');
const Page = require('../models/Page');
const nodemailer = require('nodemailer');
const { sendPaginated } = require('../utils/apiResponse');

// ======================== USERS ========================
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, role, plan } = req.query;
    const query = { role: { $nin: ['super_admin', 'vendor'] } };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) query.status = status;
    if (role) query.role = role;
    if (plan) query.plan = plan;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .populate('plan', 'name price')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    sendPaginated(res, users, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').populate('plan');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const Workspace = require('../models/Workspace');
    const user = await User.create(req.body);
    // Auto-create workspace for vendor/user roles
    if (user.role === 'vendor' || user.role === 'user') {
      const existing = await Workspace.countDocuments({ owner: user._id });
      if (existing === 0) {
        const ws = await Workspace.create({ name: user.name || 'Default', owner: user._id, members: [{ user: user._id, role: 'owner' }] });
        user.currentWorkspace = ws._id;
        await user.save();
      }
    }
    res.status(201).json({ success: true, data: { ...user.toObject(), password: undefined } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const Workspace = require('../models/Workspace');
    const { password, ...updateData } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    // Auto-create workspace if role changed to vendor/user and none exists
    if ((user.role === 'vendor' || user.role === 'user') && !user.currentWorkspace) {
      const existing = await Workspace.countDocuments({ owner: user._id });
      if (existing === 0) {
        const ws = await Workspace.create({ name: user.name || 'Default', owner: user._id, members: [{ user: user._id, role: 'owner' }] });
        await User.findByIdAndUpdate(user._id, { currentWorkspace: ws._id });
      }
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== PLANS ========================
const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find().sort('price');
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createPlan = async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updatePlan = async (req, res) => {
  try {
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deletePlan = async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Plan deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== PAYMENTS ========================
const getPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, gateway, status } = req.query;
    const filter = {};
    if (gateway) filter.gateway = gateway;
    if (status) filter.status = status;
    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter)
      .populate('user', 'name email')
      .populate('plan', 'name price')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    sendPaginated(res, payments, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== WALLET ========================
const getWalletLedger = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId } = req.query;
    const query = userId ? { user: userId } : {};
    const total = await WalletTransaction.countDocuments(query);
    const transactions = await WalletTransaction.find(query)
      .populate('user', 'name email')
      .populate('performedBy', 'name')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    sendPaginated(res, transactions, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adjustWallet = async (req, res) => {
  try {
    const { userId, amount, type, description } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (type === 'credit') {
      user.walletBalance += amount;
    } else {
      if (user.walletBalance < amount) {
        return res.status(400).json({ success: false, message: 'Insufficient balance' });
      }
      user.walletBalance -= amount;
    }
    await user.save();

    await WalletTransaction.create({
      user: userId,
      type,
      amount,
      balanceAfter: user.walletBalance,
      description: description || 'Admin adjustment',
      category: 'admin_adjustment',
      performedBy: req.user._id,
    });

    res.json({ success: true, data: { balance: user.walletBalance } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== META PRICING ========================
const getMetaPricing = async (req, res) => {
  try {
    const pricing = await MetaPricing.find().sort('countryCode category');
    res.json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateMetaPricing = async (req, res) => {
  try {
    const { countryCode, category, baseRate, markup } = req.body;
    const finalRate = baseRate * (1 + (markup || 15) / 100);

    const pricing = await MetaPricing.findOneAndUpdate(
      { countryCode, category },
      { countryCode, category, baseRate, markup: markup || 15, finalRate, ...req.body },
      { upsert: true, new: true }
    );

    res.json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== PERMISSIONS ========================
const getPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find();
    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updatePermissions = async (req, res) => {
  try {
    const { role, permissions } = req.body;
    const perm = await Permission.findOneAndUpdate(
      { role },
      { role, permissions },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: perm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== SYSTEM SETTINGS ========================
const getSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = await SystemSettings.create({});

    // Map to frontend expected format
    const mapped = {
      general: {
        appName: settings.appName || 'Wapto',
        appEmail: settings.appEmail || '',
        appDescription: settings.appDescription || '',
        appUrl: settings.appUrl || '',
        theme: settings.theme || 'emerald',
        sessionTimeout: String(settings.sessionTimeout || 24),
        primaryColor: settings.primaryColor || '#059669',
        primaryFont: settings.primaryFont || 'Inter',
        siteTheme: settings.siteTheme || 'royal-violet',
      },
      branding: {
        logo: settings.logo || '',
        favicon: settings.favicon || '',
        loginBg: settings.loginBg || '',
        tagline: settings.tagline !== undefined ? settings.tagline : 'by KKHS Media',
        logoDark: settings.logoDark || '',
      },
      whatsappWidget: {
        enabled: settings.whatsappWidget?.enabled || false,
        phone: settings.whatsappWidget?.phone || '',
        message: settings.whatsappWidget?.message || '',
        greeting: settings.whatsappWidget?.greeting || '',
      },
      whatsapp: {
        enableEmbeddedSignup: settings.whatsapp?.enableEmbeddedSignup || false,
        enableManualSignup: settings.whatsapp?.enableManualSignup !== false,
        enableCoexistence: settings.whatsapp?.enableCoexistence || false,
        apiVersion: settings.whatsapp?.apiVersion || 'v21.0',
        webhookVerifyToken: settings.whatsapp?.webhookVerifyToken || settings.whatsapp?.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '',
        appId: settings.whatsapp?.appId || '',
        appSecret: settings.whatsapp?.appSecret || '',
        configId: settings.whatsapp?.configId || '',
        businessId: settings.whatsapp?.businessId || '',
      },
      facebook: {
        appId: settings.facebook?.appId || '',
        appSecret: settings.facebook?.appSecret || '',
        webhookUrl: settings.facebook?.leadWebhookUrl || '',
      },
      email: {
        host: settings.smtp?.host || '',
        port: String(settings.smtp?.port || 587),
        user: settings.smtp?.user || '',
        password: settings.smtp?.pass || '',
        from: settings.smtp?.from || '',
        fromName: settings.smtp?.fromName || '',
        encryption: settings.smtp?.encryption || 'tls',
        templates: settings.emailTemplates || {},
      },
      google: {
        clientId: settings.google?.clientId || '',
        clientSecret: settings.google?.clientSecret || '',
        analyticsId: settings.google?.apiKey || '',
      },
      aws: {
        accessKeyId: settings.aws?.accessKeyId || '',
        secretAccessKey: settings.aws?.secretAccessKey || '',
        region: settings.aws?.region || 'ap-south-1',
        bucket: settings.aws?.bucket || '',
      },
      limits: {
        maxFileSize: String(settings.limits?.maxFileSize || 16),
        maxGroupSize: String(settings.limits?.maxGroupMembers || 256),
        maxBroadcastSize: String(10000),
      },
      wallet: {
        enabled: settings.wallet?.isEnabled !== false,
        minTopUp: String(settings.wallet?.minTopup || 100),
        maxTopUp: String(100000),
        templateRates: {
          marketing: String(settings.wallet?.templateRates?.marketing || 0),
          utility: String(settings.wallet?.templateRates?.utility || 0),
          authentication: String(settings.wallet?.templateRates?.authentication || 0),
        },
      },
      invoice: {
        companyName: settings.invoice?.companyName || '',
        address: settings.invoice?.address || '',
        gstin: settings.invoice?.gstin || '',
        phone: settings.invoice?.phone || '',
        email: settings.invoice?.email || '',
        footerNote: settings.invoice?.footerNote || '',
      },
      maintenance: {
        enabled: settings.maintenance?.isEnabled || false,
        message: settings.maintenance?.message || 'We are currently performing maintenance. Please try again later.',
      },
    };

    res.json({ success: true, data: mapped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = new SystemSettings();

    const { section, data } = req.body;

    if (section && data) {
      // Section-based update from frontend (e.g. { section: 'whatsapp', data: { appId: '...' } })
      const sectionMap = {
        general: () => {
          if (data.appName !== undefined) settings.appName = data.appName;
          if (data.appEmail !== undefined) settings.appEmail = data.appEmail;
          if (data.appDescription !== undefined) settings.appDescription = data.appDescription;
          if (data.appUrl !== undefined) settings.appUrl = data.appUrl;
          if (data.theme !== undefined) settings.theme = data.theme;
          if (data.sessionTimeout !== undefined) settings.sessionTimeout = parseInt(data.sessionTimeout) || 24;
          if (data.primaryColor !== undefined) settings.primaryColor = data.primaryColor;
          if (data.primaryFont !== undefined) settings.primaryFont = data.primaryFont;
          if (data.siteTheme !== undefined) settings.siteTheme = data.siteTheme;
        },
        branding: () => {
          if (data.logo !== undefined) settings.logo = data.logo;
          if (data.favicon !== undefined) settings.favicon = data.favicon;
          if (data.loginBg !== undefined) settings.loginBg = data.loginBg;
          if (data.tagline !== undefined) settings.tagline = data.tagline;
          if (data.logoDark !== undefined) settings.logoDark = data.logoDark;
        },
        whatsapp: () => {
          if (!settings.whatsapp) settings.whatsapp = {};
          if (data.enableEmbeddedSignup !== undefined) settings.whatsapp.enableEmbeddedSignup = data.enableEmbeddedSignup;
          if (data.enableManualSignup !== undefined) settings.whatsapp.enableManualSignup = data.enableManualSignup;
          if (data.enableCoexistence !== undefined) settings.whatsapp.enableCoexistence = data.enableCoexistence;
          if (data.apiVersion !== undefined) settings.whatsapp.apiVersion = data.apiVersion;
          if (data.webhookVerifyToken !== undefined) settings.whatsapp.webhookVerifyToken = data.webhookVerifyToken;
          if (data.appId !== undefined) settings.whatsapp.appId = data.appId;
          if (data.appSecret !== undefined) settings.whatsapp.appSecret = data.appSecret;
          if (data.configId !== undefined) settings.whatsapp.configId = data.configId;
          if (data.businessId !== undefined) settings.whatsapp.businessId = data.businessId;
        },
        facebook: () => {
          if (!settings.facebook) settings.facebook = {};
          if (data.appId !== undefined) settings.facebook.appId = data.appId;
          if (data.appSecret !== undefined) settings.facebook.appSecret = data.appSecret;
          if (data.webhookUrl !== undefined) settings.facebook.leadWebhookUrl = data.webhookUrl;
        },
        email: () => {
          if (!settings.smtp) settings.smtp = {};
          if (data.host !== undefined) settings.smtp.host = data.host;
          if (data.port !== undefined) settings.smtp.port = parseInt(data.port) || 587;
          if (data.user !== undefined) settings.smtp.user = data.user;
          if (data.password !== undefined) settings.smtp.pass = data.password;
          if (data.from !== undefined) settings.smtp.from = data.from;
          if (data.fromName !== undefined) settings.smtp.fromName = data.fromName;
          if (data.encryption !== undefined) settings.smtp.encryption = data.encryption;
          if (data.templates !== undefined) settings.emailTemplates = data.templates;
        },
        google: () => {
          if (!settings.google) settings.google = {};
          if (data.clientId !== undefined) settings.google.clientId = data.clientId;
          if (data.clientSecret !== undefined) settings.google.clientSecret = data.clientSecret;
          if (data.analyticsId !== undefined) settings.google.apiKey = data.analyticsId;
        },
        aws: () => {
          if (!settings.aws) settings.aws = {};
          if (data.accessKeyId !== undefined) settings.aws.accessKeyId = data.accessKeyId;
          if (data.secretAccessKey !== undefined) settings.aws.secretAccessKey = data.secretAccessKey;
          if (data.region !== undefined) settings.aws.region = data.region;
          if (data.bucket !== undefined) settings.aws.bucket = data.bucket;
        },
        limits: () => {
          if (!settings.limits) settings.limits = {};
          if (data.maxFileSize !== undefined) settings.limits.maxFileSize = parseInt(data.maxFileSize) || 16;
          if (data.maxGroupSize !== undefined) settings.limits.maxGroupMembers = parseInt(data.maxGroupSize) || 256;
          if (data.maxBroadcastSize !== undefined) settings.limits.maxBroadcastSize = parseInt(data.maxBroadcastSize) || 10000;
        },
        wallet: () => {
          if (!settings.wallet) settings.wallet = {};
          if (data.enabled !== undefined) settings.wallet.isEnabled = data.enabled;
          if (data.minTopUp !== undefined) settings.wallet.minTopup = parseInt(data.minTopUp) || 100;
          if (data.maxTopUp !== undefined) settings.wallet.maxTopup = parseInt(data.maxTopUp) || 100000;
          if (data.templateRates) {
            settings.wallet.templateRates = settings.wallet.templateRates || {};
            if (data.templateRates.marketing !== undefined) settings.wallet.templateRates.marketing = parseFloat(data.templateRates.marketing) || 0;
            if (data.templateRates.utility !== undefined) settings.wallet.templateRates.utility = parseFloat(data.templateRates.utility) || 0;
            if (data.templateRates.authentication !== undefined) settings.wallet.templateRates.authentication = parseFloat(data.templateRates.authentication) || 0;
          }
        },
        invoice: () => {
          if (!settings.invoice) settings.invoice = {};
          for (const f of ['companyName', 'address', 'gstin', 'phone', 'email', 'footerNote']) {
            if (data[f] !== undefined) settings.invoice[f] = data[f];
          }
        },
        maintenance: () => {
          if (!settings.maintenance) settings.maintenance = {};
          if (data.enabled !== undefined) settings.maintenance.isEnabled = data.enabled;
          if (data.message !== undefined) settings.maintenance.message = data.message;
        },
        whatsappWidget: () => {
          if (!settings.whatsappWidget) settings.whatsappWidget = {};
          if (data.enabled !== undefined) settings.whatsappWidget.enabled = data.enabled;
          if (data.phone !== undefined) settings.whatsappWidget.phone = data.phone;
          if (data.message !== undefined) settings.whatsappWidget.message = data.message;
          if (data.greeting !== undefined) settings.whatsappWidget.greeting = data.greeting;
        },
      };

      if (sectionMap[section]) {
        sectionMap[section]();
      } else {
        return res.status(400).json({ success: false, message: `Unknown section: ${section}` });
      }
    } else {
      // Direct update (legacy)
      Object.assign(settings, req.body);
    }

    await settings.save();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== LANDING PAGE ========================
const getLandingPage = async (req, res) => {
  try {
    let page = await LandingPage.findOne();
    if (!page) page = await LandingPage.create({});
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateLandingPage = async (req, res) => {
  try {
    let page = await LandingPage.findOne();
    if (!page) page = new LandingPage();
    Object.assign(page, req.body);
    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== TEMPLATES (Global) ========================
const getGlobalTemplates = async (req, res) => {
  try {
    const templates = await Template.find({ isGlobal: true }).sort('-createdAt');
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createGlobalTemplate = async (req, res) => {
  try {
    const template = await Template.create({ ...req.body, isGlobal: true });
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== INQUIRIES ========================
const getInquiries = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = status ? { status } : {};
    const total = await Inquiry.countDocuments(query);
    const inquiries = await Inquiry.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    sendPaginated(res, inquiries, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });
    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== SHORT LINKS (Admin) ========================
const getAdminShortLinks = async (req, res) => {
  try {
    const links = await ShortLink.find({ isAdmin: true }).sort('-createdAt');
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== QUICK REPLIES ========================
const getQuickReplies = async (req, res) => {
  try {
    const replies = await QuickReply.find({ isGlobal: true }).sort('-createdAt');
    res.json({ success: true, data: replies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createQuickReply = async (req, res) => {
  try {
    const reply = await QuickReply.create({ ...req.body, isGlobal: true, createdBy: req.user._id });
    res.status(201).json({ success: true, data: reply });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== GATEWAYS ========================
const getGateways = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = await SystemSettings.create({});
    res.json({ success: true, data: settings.paymentGateways });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateGateway = async (req, res) => {
  try {
    const { id } = req.params;
    const validGateways = ['stripe', 'razorpay', 'paypal', 'manual', 'paytm', 'phonepe', 'cashfree', 'payu', 'instamojo', 'paystack', 'flutterwave', 'payoneer', 'mollie', 'square', 'twocheckout', 'braintree', 'authorizenet', 'mercadopago'];
    if (!validGateways.includes(id)) {
      return res.status(400).json({ success: false, message: 'Invalid gateway: ' + id });
    }

    let settings = await SystemSettings.findOne();
    if (!settings) settings = new SystemSettings();

    settings.paymentGateways[id] = { ...settings.paymentGateways[id]?.toObject?.() || {}, ...req.body };
    await settings.save();

    res.json({ success: true, data: settings.paymentGateways });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== AI SETTINGS ========================
const getAISettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = await SystemSettings.create({});
    res.json({ success: true, data: settings.ai });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateAISettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = new SystemSettings();
    settings.ai = { ...settings.ai?.toObject?.() || {}, ...req.body };
    await settings.save();
    res.json({ success: true, data: settings.ai });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== LANGUAGES ========================
const getLanguages = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = await SystemSettings.create({});
    res.json({ success: true, data: settings.languages || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createLanguage = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = new SystemSettings();
    settings.languages.push(req.body);
    await settings.save();
    res.status(201).json({ success: true, data: settings.languages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteLanguage = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) return res.status(404).json({ success: false, message: 'Settings not found' });
    settings.languages = settings.languages.filter(l => l._id.toString() !== req.params.id);
    await settings.save();
    res.json({ success: true, data: settings.languages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== CURRENCIES ========================
const getCurrencies = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = await SystemSettings.create({});
    res.json({ success: true, data: settings.currencies || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createCurrency = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = new SystemSettings();
    settings.currencies.push(req.body);
    await settings.save();
    res.status(201).json({ success: true, data: settings.currencies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteCurrency = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) return res.status(404).json({ success: false, message: 'Settings not found' });
    settings.currencies = settings.currencies.filter(c => c._id.toString() !== req.params.id);
    await settings.save();
    res.json({ success: true, data: settings.currencies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== TAXES ========================
const getTaxes = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = await SystemSettings.create({});
    res.json({ success: true, data: settings.taxes || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createTax = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = new SystemSettings();
    settings.taxes.push(req.body);
    await settings.save();
    res.status(201).json({ success: true, data: settings.taxes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteTax = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) return res.status(404).json({ success: false, message: 'Settings not found' });
    settings.taxes = settings.taxes.filter(t => t._id.toString() !== req.params.id);
    await settings.save();
    res.json({ success: true, data: settings.taxes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== FAQ MANAGEMENT ========================
const getFAQs = async (req, res) => {
  try {
    const faqs = await FAQ.find().sort('order');
    res.json({ success: true, data: faqs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createFAQ = async (req, res) => {
  try {
    const faq = await FAQ.create(req.body);
    res.status(201).json({ success: true, data: faq });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
    res.json({ success: true, data: faq });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
    res.json({ success: true, message: 'FAQ deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== TESTIMONIAL MANAGEMENT ========================
const getTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.find().sort('order');
    res.json({ success: true, data: testimonials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.create(req.body);
    res.status(201).json({ success: true, data: testimonial });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!testimonial) return res.status(404).json({ success: false, message: 'Testimonial not found' });
    res.json({ success: true, data: testimonial });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
    if (!testimonial) return res.status(404).json({ success: false, message: 'Testimonial not found' });
    res.json({ success: true, message: 'Testimonial deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== PAGE MANAGEMENT (CMS) ========================
const getPages = async (req, res) => {
  try {
    const pages = await Page.find().sort('order');
    res.json({ success: true, data: pages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createPage = async (req, res) => {
  try {
    const page = await Page.create(req.body);
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updatePage = async (req, res) => {
  try {
    const page = await Page.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!page) return res.status(404).json({ success: false, message: 'Page not found' });
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deletePage = async (req, res) => {
  try {
    const page = await Page.findByIdAndDelete(req.params.id);
    if (!page) return res.status(404).json({ success: false, message: 'Page not found' });
    res.json({ success: true, message: 'Page deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== TEMPLATE UPDATE/DELETE ========================
const updateGlobalTemplate = async (req, res) => {
  try {
    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, isGlobal: true },
      req.body,
      { new: true, runValidators: true }
    );
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteGlobalTemplate = async (req, res) => {
  try {
    const template = await Template.findOneAndDelete({ _id: req.params.id, isGlobal: true });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== INQUIRY REPLY/DELETE ========================
const replyInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });

    const { message, subject } = req.body;
    const settings = await SystemSettings.findOne();

    if (settings?.smtp?.host && settings?.smtp?.user) {
      const transporter = nodemailer.createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port || 587,
        secure: settings.smtp.encryption === 'ssl',
        auth: {
          user: settings.smtp.user,
          pass: settings.smtp.pass,
        },
      });

      await transporter.sendMail({
        from: `"${settings.smtp.fromName || settings.appName || 'Support'}" <${settings.smtp.from || settings.smtp.user}>`,
        to: inquiry.email,
        subject: subject || `Re: ${inquiry.subject || 'Your inquiry'}`,
        html: message,
      });
    }

    inquiry.status = 'resolved';
    inquiry.notes = (inquiry.notes ? inquiry.notes + '\n' : '') + `Reply sent: ${message}`;
    await inquiry.save();

    res.json({ success: true, data: inquiry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findByIdAndDelete(req.params.id);
    if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });
    res.json({ success: true, message: 'Inquiry deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== QUICK REPLY UPDATE/DELETE ========================
const updateQuickReply = async (req, res) => {
  try {
    const reply = await QuickReply.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!reply) return res.status(404).json({ success: false, message: 'Quick reply not found' });
    res.json({ success: true, data: reply });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteQuickReply = async (req, res) => {
  try {
    const reply = await QuickReply.findByIdAndDelete(req.params.id);
    if (!reply) return res.status(404).json({ success: false, message: 'Quick reply not found' });
    res.json({ success: true, message: 'Quick reply deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== SHORT LINK DELETE ========================
const deleteAdminShortLink = async (req, res) => {
  try {
    const link = await ShortLink.findByIdAndDelete(req.params.id);
    if (!link) return res.status(404).json({ success: false, message: 'Short link not found' });
    res.json({ success: true, message: 'Short link deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== VENDORS ========================
const getVendors = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const query = { role: 'vendor' };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) query.status = status;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [vendors, total] = await Promise.all([
      User.find(query).select('-password').populate('plan', 'name').sort('-createdAt').skip(skip).limit(parseInt(limit)),
      User.countDocuments(query),
    ]);
    // attach 30d message usage per vendor (via their workspaces)
    const Workspace = require('../models/Workspace');
    const Message = require('../models/Message');
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const ids = vendors.map((v) => v._id);
    const wss = await Workspace.find({ owner: { $in: ids } }).select('_id owner');
    const wsByOwner = {};
    wss.forEach((w) => { (wsByOwner[String(w.owner)] = wsByOwner[String(w.owner)] || []).push(w._id); });
    const counts = await Message.aggregate([
      { $match: { workspace: { $in: wss.map((w) => w._id) }, createdAt: { $gte: since } } },
      { $group: { _id: '$workspace', n: { $sum: 1 } } },
    ]);
    const byWs = {}; counts.forEach((c) => { byWs[String(c._id)] = c.n; });
    const WalletTransaction = require('../models/WalletTransaction');
    const spends = await WalletTransaction.aggregate([
      { $match: { user: { $in: ids }, type: 'debit' } },
      { $group: { _id: '$user', total: { $sum: '$amount' } } },
    ]);
    const spendByUser = {}; spends.forEach((s) => { spendByUser[String(s._id)] = s.total; });
    const enriched = vendors.map((v) => {
      const o = v.toObject();
      o.messages30d = (wsByOwner[String(v._id)] || []).reduce((a, w) => a + (byWs[String(w)] || 0), 0);
      o.totalSpend = spendByUser[String(v._id)] || 0;
      return o;
    });
    sendPaginated(res, enriched, total, parseInt(page), parseInt(limit));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getVendor = async (req, res) => {
  try {
    const vendor = await User.findOne({ _id: req.params.id, role: 'vendor' }).select('-password').populate('plan', 'name');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, data: vendor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createVendor = async (req, res) => {
  try {
    const { name, email, password, phone, companyName, website, address, gstNumber, vendorNotes, plan } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });
    const vendor = await User.create({
      name, email: email.toLowerCase(), password, phone: phone || '',
      role: 'vendor', status: 'active',
      companyName: companyName || '', website: website || '',
      address: address || '', gstNumber: gstNumber || '',
      vendorNotes: vendorNotes || '', plan: plan || undefined,
    });
    // Create a default workspace so the client panel (WhatsApp connect, etc.) works
    const Workspace = require('../models/Workspace');
    const workspace = await Workspace.create({
      name: name,
      owner: vendor._id,
      members: [{ user: vendor._id, role: 'owner' }],
    });
    vendor.currentWorkspace = workspace._id;
    await vendor.save();
    const result = vendor.toObject();
    delete result.password;
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateVendor = async (req, res) => {
  try {
    const vendor = await User.findOne({ _id: req.params.id, role: 'vendor' });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const { name, phone, companyName, website, address, gstNumber, vendorNotes, status, plan, password, walletBillingExempt, walletTemplateRates, showRateCard } = req.body;
    if (name !== undefined) vendor.name = name;
    if (phone !== undefined) vendor.phone = phone;
    if (companyName !== undefined) vendor.companyName = companyName;
    if (website !== undefined) vendor.website = website;
    if (address !== undefined) vendor.address = address;
    if (gstNumber !== undefined) vendor.gstNumber = gstNumber;
    if (vendorNotes !== undefined) vendor.vendorNotes = vendorNotes;
    if (status !== undefined) vendor.status = status;
    if (plan !== undefined) vendor.plan = plan || undefined;
    if (password) vendor.password = password;
    if (walletBillingExempt !== undefined) vendor.walletBillingExempt = walletBillingExempt;
    if (showRateCard !== undefined) vendor.showRateCard = !!showRateCard;
    if (walletTemplateRates !== undefined) {
      vendor.walletTemplateRates = {
        marketing: walletTemplateRates.marketing != null ? Number(walletTemplateRates.marketing) : null,
        utility: walletTemplateRates.utility != null ? Number(walletTemplateRates.utility) : null,
        authentication: walletTemplateRates.authentication != null ? Number(walletTemplateRates.authentication) : null,
      };
    }
    await vendor.save();
    const result = vendor.toObject();
    delete result.password;
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteVendor = async (req, res) => {
  try {
    const vendor = await User.findOneAndDelete({ _id: req.params.id, role: 'vendor' });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, message: 'Vendor deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Login as vendor - generates JWT token for admin to access vendor's client panel
const jwt = require('jsonwebtoken');
const loginAsVendor = async (req, res) => {
  try {
    const vendor = await User.findOne({ _id: req.params.id, role: 'vendor' });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const token = jwt.sign({ id: vendor._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
    vendor.lastLogin = new Date();
    await vendor.save();
    const userData = vendor.toObject();
    delete userData.password;
    res.json({ success: true, data: { token, user: userData } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const approveManualPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.gateway !== 'manual') return res.status(400).json({ success: false, message: 'Not a manual payment' });
    if (payment.status === 'completed') return res.status(400).json({ success: false, message: 'Payment already approved' });

    const user = await User.findById(payment.user);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (payment.type === 'wallet_topup') {
      user.walletBalance += payment.amount;
      await user.save();
      await WalletTransaction.create({
        user: user._id,
        type: 'credit',
        amount: payment.amount,
        balanceAfter: user.walletBalance,
        description: 'Manual wallet top-up approved by admin',
        category: 'topup',
        reference: payment._id.toString(),
        performedBy: req.user._id,
      });
    } else if (payment.type === 'subscription') {
      const paidPlan = await Plan.findById(payment.plan);
      let endDate = null;
      if (paidPlan && paidPlan.price > 0) {
        if (paidPlan.interval === 'monthly') endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        else if (paidPlan.interval === 'yearly') endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      }
      user.plan = payment.plan;
      user.planExpiry = endDate;
      await user.save();
      await Subscription.updateMany({ vendor: user._id, status: 'active' }, { status: 'expired' });
      await Subscription.create({ vendor: user._id, plan: payment.plan, status: 'active', endDate, assignedBy: 'auto', payment: payment._id, notes: 'Manual payment approved' });
      if (payment.metadata?.couponCode) {
        const Coupon = require('../models/Coupon');
        await Coupon.updateOne({ code: payment.metadata.couponCode }, { $inc: { usedCount: 1 } });
      }
    }

    payment.status = 'completed';
    payment.reviewedBy = req.user._id;
    payment.reviewedAt = new Date();
    await payment.save();

    res.json({ success: true, message: 'Payment approved', data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const rejectManualPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.gateway !== 'manual') return res.status(400).json({ success: false, message: 'Not a manual payment' });
    if (payment.status === 'completed') return res.status(400).json({ success: false, message: 'Cannot reject a completed payment' });

    payment.status = 'failed';
    payment.rejectionReason = req.body.reason || 'Rejected by admin';
    payment.reviewedBy = req.user._id;
    payment.reviewedAt = new Date();
    await payment.save();

    res.json({ success: true, message: 'Payment rejected', data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const sendTestEmail = async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, message: 'Email address required' });
    const settings = await SystemSettings.findOne();
    if (!settings?.smtp?.host || !settings?.smtp?.user) {
      return res.status(400).json({ success: false, message: 'SMTP not configured' });
    }
    const transporter = nodemailer.createTransport({
      host: settings.smtp.host,
      port: settings.smtp.port || 587,
      secure: (settings.smtp.port || 587) === 465,
      auth: { user: settings.smtp.user, pass: settings.smtp.pass },
    });
    const fromName = settings.smtp.fromName || settings.appName || 'WabaPanel';
    await transporter.sendMail({
      from: `"${fromName}" <${settings.smtp.from || settings.smtp.user}>`,
      to,
      subject: 'Test Email - SMTP Configuration',
      html: '<h2>SMTP Test Successful!</h2><p>If you received this email, your SMTP configuration is working correctly.</p><p>Sent from <strong>' + (settings.appName || 'WabaPanel') + '</strong></p>',
    });
    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'SMTP Error: ' + error.message });
  }
};

// ======================== SUBSCRIPTIONS ========================
const Subscription = require('../models/Subscription');

const getSubscriptions = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    const subs = await Subscription.find(query)
      .populate('vendor', 'name email companyName phone')
      .populate('plan', 'name price interval')
      .sort('-createdAt').limit(200);
    // If search, filter by vendor name/email
    let filtered = subs;
    if (search) {
      const q = search.toLowerCase();
      filtered = subs.filter(s => s.vendor && (
        s.vendor.name?.toLowerCase().includes(q) ||
        s.vendor.email?.toLowerCase().includes(q) ||
        s.vendor.companyName?.toLowerCase().includes(q)
      ));
    }
    res.json({ success: true, data: filtered });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createSubscription = async (req, res) => {
  try {
    const { vendorId, planId, endDate, autoRenew, notes } = req.body;
    const vendor = await User.findOne({ _id: vendorId, role: 'vendor' });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    // Expire any existing active subscription
    await Subscription.updateMany({ vendor: vendorId, status: 'active' }, { status: 'expired' });
    const sub = await Subscription.create({
      vendor: vendorId, plan: planId, status: 'active',
      startDate: new Date(), endDate: endDate || null,
      autoRenew: autoRenew || false, assignedBy: 'manual', notes: notes || '',
    });
    // Update vendor's plan and expiry
    vendor.plan = planId;
    vendor.planExpiry = endDate || null;
    await vendor.save();
    const populated = await Subscription.findById(sub._id).populate('vendor', 'name email').populate('plan', 'name price interval');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSubscription = async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found' });
    const { status, planId, endDate, autoRenew, notes } = req.body;
    if (planId && String(planId) !== String(sub.plan)) {
      const plan = await Plan.findById(planId);
      if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
      sub.plan = planId;
      await User.findByIdAndUpdate(sub.vendor, { plan: planId });
    }
    if (status !== undefined) sub.status = status;
    if (endDate !== undefined) sub.endDate = endDate;
    if (autoRenew !== undefined) sub.autoRenew = autoRenew;
    if (notes !== undefined) sub.notes = notes;
    await sub.save();
    // Sync vendor plan expiry
    if (sub.status === 'active') {
      await User.findByIdAndUpdate(sub.vendor, { planExpiry: sub.endDate });
    }
    const populated = await Subscription.findById(sub._id).populate('vendor', 'name email').populate('plan', 'name price interval');
    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteSubscription = async (req, res) => {
  try {
    const sub = await Subscription.findByIdAndDelete(req.params.id);
    if (!sub) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Subscription deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== INVOICES ========================
const Invoice = require('../models/Invoice');

const getInvoices = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } },
        { vendorEmail: { $regex: search, $options: 'i' } },
      ];
    }
    const invoices = await Invoice.find(query).populate('vendor', 'name email companyName').sort('-createdAt').limit(200);
    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createInvoice = async (req, res) => {
  try {
    const { vendorId, items, gstRate, dueDate, notes } = req.body;
    const vendor = await User.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const settings = await SystemSettings.findOne().lean();
    const subtotal = items.reduce((sum, i) => sum + (i.quantity || 1) * i.unitPrice, 0);
    const rate = gstRate != null ? gstRate : 18;
    const gstAmount = Math.round(subtotal * rate / 100 * 100) / 100;
    // Generate invoice number
    const count = await Invoice.countDocuments();
    const invoiceNumber = 'INV-' + String(count + 1).padStart(5, '0');
    const invoice = await Invoice.create({
      invoiceNumber, vendor: vendorId, items,
      subtotal, gstRate: rate, gstAmount, total: subtotal + gstAmount,
      dueDate: dueDate || null, notes: notes || '', status: 'draft',
      companyName: settings?.companyName || settings?.appName || 'WABA Panel',
      companyGst: settings?.gstNumber || '',
      companyAddress: settings?.address || '',
      vendorName: vendor.name, vendorEmail: vendor.email,
      vendorGst: vendor.gstNumber || '', vendorAddress: vendor.address || '',
    });
    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    const { status, items, gstRate, dueDate, notes, paidAt } = req.body;
    if (status) invoice.status = status;
    if (items) {
      invoice.items = items;
      invoice.subtotal = items.reduce((sum, i) => sum + (i.quantity || 1) * i.unitPrice, 0);
      const rate = gstRate != null ? gstRate : invoice.gstRate;
      invoice.gstRate = rate;
      invoice.gstAmount = Math.round(invoice.subtotal * rate / 100 * 100) / 100;
      invoice.total = invoice.subtotal + invoice.gstAmount;
    }
    if (dueDate !== undefined) invoice.dueDate = dueDate;
    if (notes !== undefined) invoice.notes = notes;
    if (paidAt) invoice.paidAt = paidAt;
    await invoice.save();
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteInvoice = async (req, res) => {
  try {
    await Invoice.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getInvoicePdf = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    // Return HTML invoice for PDF generation/print
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${invoice.invoiceNumber}</title>
<style>body{font-family:Arial,sans-serif;padding:40px;color:#333}h1{color:#059669;margin:0}.header{display:flex;justify-content:space-between;border-bottom:2px solid #059669;padding-bottom:20px;margin-bottom:30px}.meta{text-align:right}.info{display:flex;justify-content:space-between;margin-bottom:30px}.box{background:#f9fafb;padding:15px;border-radius:8px;width:45%}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#f3f4f6;padding:10px;text-align:left;font-size:13px}td{padding:10px;border-bottom:1px solid #e5e7eb;font-size:13px}.totals{text-align:right;margin-top:20px}.totals div{margin:5px 0}.total-final{font-size:18px;font-weight:bold;color:#059669}.status{display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold}</style></head><body>
<div class="header"><div><h1>${invoice.companyName || 'WABA Panel'}</h1><p style="margin:5px 0;font-size:13px;color:#666">${invoice.companyAddress || ''}</p>${invoice.companyGst ? '<p style="font-size:12px;color:#666">GST: ' + invoice.companyGst + '</p>' : ''}</div><div class="meta"><h2 style="margin:0">INVOICE</h2><p style="margin:5px 0;font-size:14px"><strong>${invoice.invoiceNumber}</strong></p><p style="font-size:12px;color:#666">Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN')}</p>${invoice.dueDate ? '<p style="font-size:12px;color:#666">Due: ' + new Date(invoice.dueDate).toLocaleDateString('en-IN') + '</p>' : ''}<p><span class="status" style="background:${invoice.status === 'paid' ? '#d1fae5;color:#059669' : invoice.status === 'sent' ? '#dbeafe;color:#2563eb' : '#f3f4f6;color:#666'}">${invoice.status.toUpperCase()}</span></p></div></div>
<div class="info"><div class="box"><h4 style="margin:0 0 8px;color:#059669">Bill To</h4><p style="margin:3px 0;font-weight:bold">${invoice.vendorName}</p><p style="margin:3px 0;font-size:13px">${invoice.vendorEmail}</p><p style="margin:3px 0;font-size:13px">${invoice.vendorAddress || ''}</p>${invoice.vendorGst ? '<p style="margin:3px 0;font-size:12px">GST: ' + invoice.vendorGst + '</p>' : ''}</div></div>
<table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${invoice.items.map((item, i) => '<tr><td>' + (i + 1) + '</td><td>' + item.description + '</td><td>' + (item.quantity || 1) + '</td><td>₹' + item.unitPrice.toLocaleString('en-IN') + '</td><td>₹' + item.amount.toLocaleString('en-IN') + '</td></tr>').join('')}</tbody></table>
<div class="totals"><div>Subtotal: <strong>₹${invoice.subtotal.toLocaleString('en-IN')}</strong></div><div>GST (${invoice.gstRate}%): <strong>₹${invoice.gstAmount.toLocaleString('en-IN')}</strong></div><div class="total-final">Total: ₹${invoice.total.toLocaleString('en-IN')}</div></div>
${invoice.notes ? '<div style="margin-top:30px;padding:15px;background:#f9fafb;border-radius:8px"><h4 style="margin:0 0 8px">Notes</h4><p style="margin:0;font-size:13px">' + invoice.notes + '</p></div>' : ''}
</body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== VENDOR DETAIL ========================
const getVendorDetail = async (req, res) => {
  try {
    const vendor = await User.findOne({ _id: req.params.id, role: 'vendor' }).select('-password').populate('plan', 'name price interval');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const Workspace = require('../models/Workspace');
    const Message = require('../models/Message');
    const Contact = require('../models/Contact');
    const Campaign = require('../models/Campaign');
    const Conversation = require('../models/Conversation');
    const workspaces = await Workspace.find({ owner: vendor._id }).select('_id');
    const wsIds = workspaces.map(w => w._id);
    const since30 = new Date(Date.now() - 30 * 86400000);
    const since7 = new Date(Date.now() - 7 * 86400000);
    const [totalMessages, messages30d, messages7d, totalContacts, totalCampaigns, totalConversations, recentMessages] = await Promise.all([
      Message.countDocuments({ workspace: { $in: wsIds } }),
      Message.countDocuments({ workspace: { $in: wsIds }, createdAt: { $gte: since30 } }),
      Message.countDocuments({ workspace: { $in: wsIds }, createdAt: { $gte: since7 } }),
      Contact.countDocuments({ workspace: { $in: wsIds } }),
      Campaign.countDocuments({ workspace: { $in: wsIds } }),
      Conversation.countDocuments({ workspace: { $in: wsIds } }),
      Message.find({ workspace: { $in: wsIds } }).sort('-createdAt').limit(5).select('body type createdAt'),
    ]);
    const subs = await Subscription.find({ vendor: vendor._id }).populate('plan', 'name price interval').sort('-createdAt').limit(5);
    const invoices = await Invoice.find({ vendor: vendor._id }).sort('-createdAt').limit(5);
    const walletTxns = await WalletTransaction.find({ user: vendor._id }).sort('-createdAt').limit(10);
    res.json({
      success: true, data: {
        vendor: vendor.toObject(),
        stats: { totalMessages, messages30d, messages7d, totalContacts, totalCampaigns, totalConversations },
        recentMessages, subscriptions: subs, invoices, walletTransactions: walletTxns,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== BLOG ========================
const BlogPost = require('../models/BlogPost');

const getBlogPosts = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;
    const posts = await BlogPost.find(query).populate('author', 'name').sort('-createdAt');
    res.json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createBlogPost = async (req, res) => {
  try {
    const { title, content, excerpt, coverImage, status, tags, metaTitle, metaDescription } = req.body;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const post = await BlogPost.create({
      title, slug, content, excerpt: excerpt || '', coverImage: coverImage || '',
      author: req.user._id, status: status || 'draft',
      tags: tags || [], metaTitle: metaTitle || '', metaDescription: metaDescription || '',
      publishedAt: status === 'published' ? new Date() : null,
    });
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateBlogPost = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Not found' });
    const { title, content, excerpt, coverImage, status, tags, metaTitle, metaDescription } = req.body;
    if (title !== undefined) { post.title = title; post.slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
    if (content !== undefined) post.content = content;
    if (excerpt !== undefined) post.excerpt = excerpt;
    if (coverImage !== undefined) post.coverImage = coverImage;
    if (status !== undefined) { post.status = status; if (status === 'published' && !post.publishedAt) post.publishedAt = new Date(); }
    if (tags !== undefined) post.tags = tags;
    if (metaTitle !== undefined) post.metaTitle = metaTitle;
    if (metaDescription !== undefined) post.metaDescription = metaDescription;
    await post.save();
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteBlogPost = async (req, res) => {
  try {
    await BlogPost.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Blog post deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================== PLAN REMINDERS ========================
const checkExpiringPlans = async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.days) || 7;
    const futureDate = new Date(Date.now() + daysAhead * 86400000);
    const expiring = await User.find({
      role: 'vendor', status: 'active',
      planExpiry: { $lte: futureDate, $gte: new Date() },
    }).select('name email companyName planExpiry').populate('plan', 'name price');
    const expired = await User.find({
      role: 'vendor', status: 'active',
      planExpiry: { $lt: new Date(), $ne: null },
    }).select('name email companyName planExpiry').populate('plan', 'name price');
    res.json({ success: true, data: { expiring, expired } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const sendPlanReminder = async (req, res) => {
  try {
    const { vendorId, message } = req.body;
    const vendor = await User.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    // Send email notification
    const settings = await SystemSettings.findOne().lean();
    const smtpHost = settings?.smtpHost || 'smtp.gmail.com';
    const smtpPort = settings?.smtpPort || 587;
    const smtpUser = settings?.smtpUser || '';
    const smtpPass = settings?.smtpPass || '';
    const fromEmail = settings?.smtpFromEmail || smtpUser;
    const fromName = settings?.smtpFromName || settings?.appName || 'WABA Panel';
    if (!smtpUser) return res.status(400).json({ success: false, message: 'SMTP not configured' });
    const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: vendor.email,
      subject: 'Plan Expiry Reminder',
      html: message || `<p>Hi ${vendor.name},</p><p>Your plan is expiring soon. Please renew to continue using all features.</p><p>Thank you,<br>${fromName}</p>`,
    });
    res.json({ success: true, message: 'Reminder sent to ' + vendor.email });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// ======================== AUTO PLAN REMINDER ========================
const getAutoReminderSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.findOne().lean();
    res.json({ success: true, data: settings?.planAutoReminder || { enabled: false, daysBefore: [7, 3, 1], lastRunAt: null, sentLog: [] } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateAutoReminderSettings = async (req, res) => {
  try {
    const { enabled, daysBefore } = req.body;
    const update = {};
    if (enabled !== undefined) update['planAutoReminder.enabled'] = enabled;
    if (daysBefore !== undefined) update['planAutoReminder.daysBefore'] = daysBefore;
    await SystemSettings.findOneAndUpdate({}, { $set: update }, { upsert: true });
    res.json({ success: true, message: 'Auto reminder settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const runAutoReminder = async () => {
  try {
    const settings = await SystemSettings.findOne();
    if (!settings?.planAutoReminder?.enabled) return { skipped: true };
    if (!settings?.smtp?.host || !settings?.smtp?.user) return { skipped: true, reason: 'SMTP not configured' };

    const daysBefore = settings.planAutoReminder.daysBefore || [7, 3, 1];
    const sentLog = settings.planAutoReminder.sentLog || [];
    const today = new Date(); today.setHours(0,0,0,0);
    let sentCount = 0;

    for (const days of daysBefore) {
      const targetDate = new Date(Date.now() + days * 86400000);
      const startOfDay = new Date(targetDate); startOfDay.setHours(0,0,0,0);
      const endOfDay = new Date(targetDate); endOfDay.setHours(23,59,59,999);

      const vendors = await User.find({
        role: 'vendor', status: 'active',
        planExpiry: { $gte: startOfDay, $lte: endOfDay },
      }).populate('plan', 'name');

      for (const vendor of vendors) {
        // Check if already sent today for this vendor+days combo
        const alreadySent = sentLog.some(l => l.vendorId === String(vendor._id) && l.daysLeft === days && new Date(l.sentAt) >= today);
        if (alreadySent) continue;

        // Use planExpiry email template if available
        const template = settings.emailTemplates?.planExpiry;
        if (template && !template.enabled) continue;

        const appName = settings.appName || 'WABA Panel';
        const subject = (template?.subject || 'Plan Expiring Soon - {{appName}}').replace(/\{\{appName\}\}/g, appName);
        let body = (template?.body || '<p>Hi {{userName}},</p><p>Your plan expires in {{daysLeft}} days.</p>')
          .replace(/\{\{userName\}\}/g, vendor.name)
          .replace(/\{\{appName\}\}/g, appName)
          .replace(/\{\{planName\}\}/g, vendor.plan?.name || 'N/A')
          .replace(/\{\{expiryDate\}\}/g, new Date(vendor.planExpiry).toLocaleDateString('en-IN'))
          .replace(/\{\{appUrl\}\}/g, settings.appUrl || '');
        // Add days left info
        body = body.replace(/\{\{daysLeft\}\}/g, String(days));

        try {
          const transporter = require('nodemailer').createTransport({
            host: settings.smtp.host, port: settings.smtp.port || 587,
            secure: (settings.smtp.port || 587) === 465,
            auth: { user: settings.smtp.user, pass: settings.smtp.pass },
          });
          const fromName = settings.smtp.fromName || appName;
          await transporter.sendMail({
            from: `"${fromName}" <${settings.smtp.from || settings.smtp.user}>`,
            to: vendor.email, subject, html: body,
          });
          sentLog.push({ vendorId: String(vendor._id), sentAt: new Date(), daysLeft: days });
          sentCount++;
        } catch (mailErr) {
          console.error('[Plan Reminder] Mail error for', vendor.email, mailErr.message);
        }
      }
    }

    // Keep only last 7 days of sent log
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const trimmedLog = sentLog.filter(l => new Date(l.sentAt) >= weekAgo);
    await SystemSettings.findOneAndUpdate({}, { $set: { 'planAutoReminder.lastRunAt': new Date(), 'planAutoReminder.sentLog': trimmedLog } });

    if (sentCount > 0) console.log('[Plan Reminder] Sent', sentCount, 'auto reminders');
    return { sentCount };
  } catch (error) {
    console.error('[Plan Reminder] Error:', error.message);
    return { error: error.message };
  }
};

const triggerAutoReminder = async (req, res) => {
  try {
    const result = await runAutoReminder();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Knowledge Base CRUD ───
const KnowledgeBase = require('../models/KnowledgeBase');

const getKnowledgeArticles = async (req, res) => {
  try {
    const articles = await KnowledgeBase.find().sort('order');
    res.json({ success: true, data: articles });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const createKnowledgeArticle = async (req, res) => {
  try {
    const { title, content, excerpt, category, tags, icon, order, status, metaTitle, metaDescription } = req.body;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const article = await KnowledgeBase.create({ title, slug, content, excerpt, category, tags, icon, order, status, metaTitle, metaDescription });
    res.json({ success: true, data: article });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const updateKnowledgeArticle = async (req, res) => {
  try {
    const article = await KnowledgeBase.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!article) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: article });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const deleteKnowledgeArticle = async (req, res) => {
  try {
    await KnowledgeBase.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};


// ======================== SITE CONTENT (Website Customization) ========================
const SiteContent = require('../models/SiteContent');
const siteContentDefaults = require('../config/siteContentDefaults');

const deepMergeContent = (base, override) => {
  if (Array.isArray(override)) return override;
  if (override && typeof override === 'object' && base && typeof base === 'object' && !Array.isArray(base)) {
    const out = { ...base };
    for (const k of Object.keys(override)) out[k] = deepMergeContent(base[k], override[k]);
    return out;
  }
  return override === undefined ? base : override;
};

const getSiteContent = async (req, res) => {
  try {
    const doc = await SiteContent.findOne().lean();
    res.json({ success: true, data: deepMergeContent(siteContentDefaults, (doc && doc.content) || {}) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSiteContent = async (req, res) => {
  try {
    let doc = await SiteContent.findOne();
    if (!doc) doc = new SiteContent();
    doc.content = req.body.content || {};
    doc.markModified('content');
    await doc.save();
    res.json({ success: true, data: deepMergeContent(siteContentDefaults, doc.content) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== PAYMENT INVOICE (PDF + EMAIL) ====================
const { buildPlanInvoicePdf } = require('../services/planInvoicePdf');
const buildAdminPaymentPdf = (payment) => buildPlanInvoicePdf(payment);
const getPaymentInvoicePdf = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).populate('plan', 'name');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    const built = await buildAdminPaymentPdf(payment);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${built.invoiceNo}.pdf"`);
    res.send(built.buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const emailPaymentInvoices = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, message: 'No payments selected' });
    const settings = await SystemSettings.findOne().lean();
    const smtp = settings && settings.smtp;
    if (!smtp || !smtp.host || !smtp.user) {
      return res.status(400).json({ success: false, message: 'SMTP is not configured (Admin > Settings > SMTP)' });
    }
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port || 587, secure: smtp.encryption === 'ssl',
      auth: { user: smtp.user, pass: smtp.pass },
    });
    const errors = [];
    let sent = 0;
    for (const id of ids.slice(0, 50)) {
      try {
        const payment = await Payment.findById(id).populate('plan', 'name');
        if (!payment) { errors.push(`${id}: payment not found`); continue; }
        const built = await buildAdminPaymentPdf(payment);
        if (!built.email) { errors.push(`${built.invoiceNo}: vendor has no email`); continue; }
        await transporter.sendMail({
          from: smtp.fromName ? `"${smtp.fromName}" <${smtp.from || smtp.user}>` : (smtp.from || smtp.user),
          to: built.email,
          subject: `Invoice ${built.invoiceNo} - ${(settings && settings.appName) || 'WabaPanel'}`,
          text: `Please find attached invoice ${built.invoiceNo} for a total of Rs. ${Number(payment.amount || 0).toFixed(2)}.`,
          attachments: [{ filename: `invoice-${built.invoiceNo}.pdf`, content: built.buffer }],
        });
        sent++;
      } catch (e) {
        errors.push(`${id}: ${e.message}`);
      }
    }
    res.json({ success: true, sent, errors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/admin/feature-controls — vendors + their feature overrides + catalog
const getFeatureControls = async (req, res) => {
  try {
    const { FEATURE_CATALOG } = require('../middleware/featureGate');
    const vendors = await User.find({ role: 'vendor' })
      .select('name email companyName status featureOverrides plan')
      .populate('plan', 'name')
      .sort('-createdAt');
    res.json({ success: true, data: { catalog: FEATURE_CATALOG, vendors } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/admin/feature-controls/:vendorId — body: { features: { key: bool } }
const updateFeatureControls = async (req, res) => {
  try {
    const { FEATURE_KEYS } = require('../middleware/featureGate');
    const vendor = await User.findOne({ _id: req.params.vendorId, role: 'vendor' });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    const incoming = req.body.features || {};
    const overrides = { ...(vendor.featureOverrides || {}) };
    const changed = [];
    for (const key of FEATURE_KEYS) {
      if (typeof incoming[key] === 'boolean') {
        const prev = overrides[key] !== false;
        if (incoming[key]) delete overrides[key];
        else overrides[key] = false;
        if (prev !== incoming[key]) changed.push(`${key}=${incoming[key] ? 'on' : 'off'}`);
      }
    }
    vendor.featureOverrides = overrides;
    vendor.markModified('featureOverrides');
    await vendor.save();
    if (changed.length) {
      try {
        const AuditLog = require('../models/AuditLog');
        const ws = await Workspace.findOne({ owner: vendor._id }).select('_id');
        if (ws) {
          await AuditLog.create({
            workspace: ws._id, user: req.user._id, action: 'feature_controls_updated',
            resource: 'vendor', resourceId: String(vendor._id), details: changed.join(', '),
          });
        }
      } catch (e) { /* noop */ }
    }
    res.json({ success: true, data: { featureOverrides: vendor.featureOverrides } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/admin/data-cleanup — settings + current record counts per category
const getDataCleanup = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { CATEGORY_MODELS } = require('../services/dataCleanup');
    let settings = await SystemSettings.findOne();
    if (!settings) settings = await SystemSettings.create({});
    const workspaceId = req.query.workspace || '';
    const counts = {};
    for (const [key, def] of Object.entries(CATEGORY_MODELS)) {
      try {
        require(`../models/${def.model}`);
        counts[key] = workspaceId
          ? await mongoose.model(def.model).countDocuments({ workspace: workspaceId })
          : await mongoose.model(def.model).estimatedDocumentCount();
      } catch { counts[key] = 0; }
    }
    const Workspace = require('../models/Workspace');
    const workspaces = await Workspace.find().select('name owner').populate('owner', 'name email').sort({ name: 1 }).lean();
    res.json({ success: true, data: { settings: settings.dataCleanup || {}, counts, labels: Object.fromEntries(Object.entries(CATEGORY_MODELS).map(([k, v]) => [k, v.label])), workspaces } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/admin/data-cleanup
const updateDataCleanup = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = await SystemSettings.create({});
    const { enabled, runHour, categories } = req.body;
    if (!settings.dataCleanup) settings.dataCleanup = {};
    if (enabled !== undefined) settings.dataCleanup.enabled = !!enabled;
    if (runHour !== undefined) settings.dataCleanup.runHour = Math.min(23, Math.max(0, Number(runHour) || 0));
    if (categories && typeof categories === 'object') {
      const { CATEGORY_MODELS } = require('../services/dataCleanup');
      for (const key of Object.keys(CATEGORY_MODELS)) {
        if (categories[key]) {
          if (!settings.dataCleanup.categories) settings.dataCleanup.categories = {};
          settings.dataCleanup.categories[key] = {
            enabled: !!categories[key].enabled,
            days: Math.max(1, Number(categories[key].days) || 30),
          };
        }
      }
    }
    settings.markModified('dataCleanup');
    await settings.save();
    res.json({ success: true, data: settings.dataCleanup });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/admin/data-cleanup/run
const runDataCleanup = async (req, res) => {
  try {
    const { runCleanup } = require('../services/dataCleanup');
    const summary = await runCleanup({ workspaceId: req.body?.workspace || undefined, force: true });
    res.json({ success: true, data: { summary } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getUsers, getUser, createUser, updateUser, deleteUser,
  getFeatureControls, updateFeatureControls,
  getDataCleanup, updateDataCleanup, runDataCleanup,
  getPlans, createPlan, updatePlan, deletePlan,
  getPayments, getPaymentInvoicePdf, emailPaymentInvoices, getWalletLedger, adjustWallet, approveManualPayment, rejectManualPayment,
  getMetaPricing, updateMetaPricing,
  getPermissions, updatePermissions,
  getSettings, updateSettings,
  getLandingPage, updateLandingPage,
  getSiteContent, updateSiteContent,
  getGlobalTemplates, createGlobalTemplate, updateGlobalTemplate, deleteGlobalTemplate,
  getInquiries, updateInquiry, replyInquiry, deleteInquiry,
  getAdminShortLinks, deleteAdminShortLink,
  getQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply,
  getGateways, updateGateway,
  getAISettings, updateAISettings,
  getLanguages, createLanguage, deleteLanguage,
  getCurrencies, createCurrency, deleteCurrency,
  getTaxes, createTax, deleteTax,
  getFAQs, createFAQ, updateFAQ, deleteFAQ,
  getTestimonials, createTestimonial, updateTestimonial, deleteTestimonial,
  getPages, createPage, updatePage, deletePage,
  getVendors, getVendor, createVendor, updateVendor, deleteVendor, loginAsVendor,
  sendTestEmail,
  getSubscriptions, createSubscription, updateSubscription, deleteSubscription,
  getInvoices, createInvoice, updateInvoice, deleteInvoice, getInvoicePdf,
  getVendorDetail,
  getBlogPosts, createBlogPost, updateBlogPost, deleteBlogPost,
  checkExpiringPlans, sendPlanReminder,
  getAutoReminderSettings, updateAutoReminderSettings, triggerAutoReminder, runAutoReminder,
  getKnowledgeArticles, createKnowledgeArticle, updateKnowledgeArticle, deleteKnowledgeArticle,
};

