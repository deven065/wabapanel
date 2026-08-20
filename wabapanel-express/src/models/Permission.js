const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  role: { type: String, enum: ['admin', 'user', 'agent', 'super_admin'], required: true, unique: true },
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('Permission', permissionSchema);
