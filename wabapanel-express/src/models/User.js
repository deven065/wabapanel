const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  twoFactorSecret: { type: String, default: "" },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorMethod: { type: String, enum: ['app', 'email'], default: 'app' },
  twoFactorEmailOTP: { type: String, default: '' },
  twoFactorEmailExpire: { type: Date },
  phone: { type: String, default: '' },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['super_admin', 'admin', 'user', 'agent', 'vendor'], default: 'user' },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  isEmailVerified: { type: Boolean, default: false },
  currentWorkspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  planExpiry: { type: Date },
  // Admin-controlled per-client feature switches (featureKey -> false disables the module)
  featureOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
  trialUsed: { type: Boolean, default: false },
  walletBalance: { type: Number, default: 0 },
  walletAutoTopup: {
    active: { type: Boolean, default: false },
    amount: { type: Number, default: 0 },
    gatewaySubscriptionId: { type: String, default: '' },
  },
  walletBillingExempt: { type: Boolean, default: false },
  showRateCard: { type: Boolean, default: true },
  walletTemplateRates: {
    marketing: { type: Number, default: null },
    utility: { type: Number, default: null },
    authentication: { type: Number, default: null },
  },
  permissions: [{ type: String }],
  allowedChannels: [{ type: String }],
  inboxScope: { type: String, enum: ['all', 'assigned'], default: 'all' },
  lastLogin: { type: Date },
  emailVerified: { type: Boolean, default: true },
  emailVerifyToken: { type: String },
  emailVerifyExpire: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },
  // Vendor-specific fields
  companyName: { type: String, default: '' },
  website: { type: String, default: '' },
  address: { type: String, default: '' },
  gstNumber: { type: String, default: '' },
  vendorNotes: { type: String, default: '' },
}, { timestamps: true });

userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
