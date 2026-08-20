require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Plan = require('./models/Plan');
const SystemSettings = require('./models/SystemSettings');
const Permission = require('./models/Permission');
const LandingPage = require('./models/LandingPage');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wapto');
    console.log('Connected to MongoDB');

    // Seed Plans
    const existingPlans = await Plan.countDocuments();
    if (existingPlans === 0) {
      await Plan.create([
        {
          name: 'Free',
          description: 'Get started for free',
          price: 0,
          interval: 'lifetime',
          limits: {
            contacts: 100, templateBots: 5, messageBots: 2, campaigns: 5,
            aiPrompts: 10, agents: 1, conversations: 50, teams: 1,
            botFlows: 2, customFields: 5, tags: 10, whatsappForms: 2,
            aiCallingAgents: 0, appointmentBookings: 10, facebookAdsCampaigns: 0,
            kanbanFunnels: 1, segments: 5,
          },
          features: { restApi: false, whatsappWebhook: true, autoReplies: true, analytics: false, prioritySupport: false },
        },
        {
          name: 'Silver',
          description: 'Perfect for growing businesses',
          price: 2000,
          interval: 'lifetime',
          isPopular: true,
          limits: {
            contacts: -1, templateBots: 100, messageBots: 10, campaigns: 100,
            aiPrompts: 99, agents: 100, conversations: 100, teams: 15,
            botFlows: 100, customFields: 100, tags: 100, whatsappForms: 100,
            aiCallingAgents: 100, appointmentBookings: 100, facebookAdsCampaigns: 100,
            kanbanFunnels: 100, segments: 100,
          },
          features: { restApi: true, whatsappWebhook: true, autoReplies: true, analytics: true, prioritySupport: false },
        },
        {
          name: 'Unlimited',
          description: 'For enterprise needs',
          price: 9999,
          interval: 'lifetime',
          limits: {
            contacts: -1, templateBots: -1, messageBots: -1, campaigns: -1,
            aiPrompts: -1, agents: -1, conversations: -1, teams: -1,
            botFlows: -1, customFields: -1, tags: -1, whatsappForms: -1,
            aiCallingAgents: -1, appointmentBookings: -1, facebookAdsCampaigns: -1,
            kanbanFunnels: -1, segments: -1,
          },
          features: { restApi: true, whatsappWebhook: true, autoReplies: true, analytics: true, prioritySupport: true },
        },
      ]);
      console.log('Plans seeded');
    }

    // Seed Super Admin
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@wabapanel.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
    const existingAdmin = await User.findOne({ role: 'super_admin' });
    if (!existingAdmin) {
      const freePlan = await Plan.findOne({ price: 0 });
      await User.create({
        name: 'Super Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'super_admin',
        status: 'active',
        plan: freePlan?._id,
      });
      console.log(`Super Admin created (${adminEmail})`);
    }

    // Seed demo user
    const existingUser = await User.findOne({ email: 'demo@wabapanel.com' });
    if (!existingUser) {
      const silverPlan = await Plan.findOne({ name: 'Silver' });
      const Workspace = require('./models/Workspace');

      const user = await User.create({
        name: 'Demo User',
        email: 'demo@wabapanel.com',
        password: 'demo123456',
        role: 'user',
        status: 'active',
        plan: silverPlan?._id,
        walletBalance: 2000,
      });

      const workspace = await Workspace.create({
        name: "Demo User's Workspace",
        owner: user._id,
        members: [{ user: user._id, role: 'owner' }],
      });

      user.currentWorkspace = workspace._id;
      await user.save();
      console.log('Demo User created (demo@wabapanel.com / demo123456)');
    }

    // Seed Permissions
    const existingPerms = await Permission.countDocuments();
    if (existingPerms === 0) {
      const fullPerms = {
        dashboard: { view: true },
        contacts: { view: true, create: true, edit: true, delete: true, import: true, export: true },
        segments: { view: true, create: true, edit: true, delete: true },
        tags: { view: true, create: true, edit: true, delete: true },
        templates: { view: true, create: true, edit: true, delete: true },
        campaigns: { view: true, create: true, edit: true, delete: true },
        automations: { view: true, create: true, edit: true, delete: true },
        chat: { view: true, send: true, assign: true },
        teams: { view: true, manage: true },
        billing: { view: true, manage: true },
        settings: { view: true, manage: true },
        pipelines: { view: true, create: true, edit: true, delete: true },
        forms: { view: true, create: true, edit: true, delete: true },
        shortLinks: { view: true, create: true, edit: true, delete: true },
        appointments: { view: true, create: true, edit: true, delete: true },
        whatsapp: { connect: true, manage: true },
        analytics: { view: true },
      };

      const agentPerms = {
        dashboard: { view: true },
        contacts: { view: true, create: true, edit: true, delete: false, import: false, export: false },
        segments: { view: true, create: false, edit: false, delete: false },
        tags: { view: true, create: false, edit: false, delete: false },
        templates: { view: true, create: false, edit: false, delete: false },
        campaigns: { view: true, create: false, edit: false, delete: false },
        automations: { view: true, create: false, edit: false, delete: false },
        chat: { view: true, send: true, assign: false },
        teams: { view: true, manage: false },
        billing: { view: false, manage: false },
        settings: { view: false, manage: false },
        pipelines: { view: true, create: true, edit: true, delete: false },
        forms: { view: true, create: false, edit: false, delete: false },
        shortLinks: { view: true, create: false, edit: false, delete: false },
        appointments: { view: true, create: true, edit: true, delete: false },
        whatsapp: { connect: false, manage: false },
        analytics: { view: true },
      };

      await Permission.create([
        { role: 'super_admin', permissions: fullPerms },
        { role: 'admin', permissions: fullPerms },
        { role: 'user', permissions: fullPerms },
        { role: 'agent', permissions: agentPerms },
      ]);
      console.log('Permissions seeded');
    }

    // Seed System Settings
    const existingSettings = await SystemSettings.countDocuments();
    if (existingSettings === 0) {
      await SystemSettings.create({
        appName: 'WabaPanel',
        appEmail: 'support@wabapanel.com',
        appDescription: 'WhatsApp Business API Platform',
        ai: {
          providers: [
            { name: 'openai', displayName: 'OpenAI GPT-4o', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', isActive: false },
            { name: 'deepseek', displayName: 'DeepSeek Chat', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', isActive: false },
            { name: 'xai', displayName: 'xAI Grok Beta', model: 'grok-beta', baseUrl: 'https://api.x.ai/v1', isActive: false },
            { name: 'gemini', displayName: 'Google Gemini', model: 'gemini-pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', isActive: false },
          ],
          defaultProvider: 'openai',
        },
        languages: [
          { code: 'en', name: 'English', isDefault: true, isActive: true },
          { code: 'hi', name: 'Hindi', isDefault: false, isActive: true },
        ],
        currencies: [
          { code: 'INR', name: 'Indian Rupee', symbol: '₹', isDefault: true, isActive: true },
          { code: 'USD', name: 'US Dollar', symbol: '$', isDefault: false, isActive: true },
        ],
      });
      console.log('System Settings seeded');
    }

    // Seed Landing Page
    const existingLP = await LandingPage.countDocuments();
    if (existingLP === 0) {
      await LandingPage.create({
        hero: {
          title: 'Transform Your Business Communication',
          subtitle: 'Powerful WhatsApp Business API Platform',
          description: 'Send campaigns, automate responses, manage contacts - all from one platform.',
          ctaText: 'Get Started Free',
          ctaLink: '/register',
        },
        features: [
          { icon: 'MessageSquare', title: 'WhatsApp Messaging', description: 'Send and receive messages through WhatsApp Business API', order: 0 },
          { icon: 'Zap', title: 'Automation Builder', description: 'Create powerful automation flows with our visual builder', order: 1 },
          { icon: 'BarChart3', title: 'Analytics Dashboard', description: 'Track message delivery, read rates, and campaign performance', order: 2 },
          { icon: 'Users', title: 'Contact Management', description: 'Organize contacts with tags, segments, and custom fields', order: 3 },
          { icon: 'Send', title: 'Broadcast Campaigns', description: 'Send bulk messages to targeted audiences', order: 4 },
          { icon: 'Bot', title: 'AI Powered', description: 'Integrate AI for smart auto-replies and customer support', order: 5 },
        ],
        faq: [
          { question: 'What is WhatsApp Business API?', answer: 'WhatsApp Business API is a solution for medium and large businesses to communicate with customers at scale through WhatsApp.', order: 0 },
          { question: 'How do I get started?', answer: 'Sign up for a free account, connect your WhatsApp Business number, and start sending messages.', order: 1 },
          { question: 'What payment methods do you accept?', answer: 'We accept credit/debit cards via Stripe, UPI and netbanking via Razorpay, and PayPal.', order: 2 },
        ],
        isPublished: true,
      });
      console.log('Landing Page seeded');
    }

    console.log('Seed complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seed();
