const mongoose = require('mongoose');

const landingPageSchema = new mongoose.Schema({
  hero: {
    title: { type: String, default: 'Transform Your Business Communication' },
    subtitle: { type: String, default: 'Powerful WhatsApp Business API Platform' },
    description: { type: String, default: '' },
    ctaText: { type: String, default: 'Get Started Free' },
    ctaLink: { type: String, default: '/register' },
    backgroundImage: { type: String, default: '' },
    heroImage: { type: String, default: '' },
  },
  features: [{
    icon: { type: String, default: '' },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    order: { type: Number, default: 0 },
  }],
  platform: {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    screenshots: [{ type: String }],
  },
  pricing: {
    title: { type: String, default: 'Choose Your Plan' },
    subtitle: { type: String, default: '' },
    showPlans: { type: Boolean, default: true },
  },
  testimonials: [{
    name: { type: String, required: true },
    company: { type: String, default: '' },
    avatar: { type: String, default: '' },
    rating: { type: Number, default: 5 },
    text: { type: String, required: true },
    order: { type: Number, default: 0 },
  }],
  faq: [{
    question: { type: String, required: true },
    answer: { type: String, required: true },
    order: { type: Number, default: 0 },
  }],
  contact: {
    title: { type: String, default: 'Contact Us' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    showForm: { type: Boolean, default: true },
  },
  footer: {
    companyName: { type: String, default: '' },
    description: { type: String, default: '' },
    links: [{
      title: { type: String },
      url: { type: String },
      section: { type: String, enum: ['company', 'product', 'legal', 'social'], default: 'company' },
    }],
    socialLinks: {
      facebook: { type: String, default: '' },
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      youtube: { type: String, default: '' },
    },
    copyrightText: { type: String, default: '' },
  },
  seo: {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    keywords: [{ type: String }],
    ogImage: { type: String, default: '' },
  },
  isPublished: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('LandingPage', landingPageSchema);
