const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
    const user = await User.findById(decoded.id).select('-password').populate('currentWorkspace').populate('plan');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is suspended' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin')) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
};

const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }
};

const checkPermission = (resource, action) => {
  return async (req, res, next) => {
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
      return next();
    }

    const Permission = require('../models/Permission');
    const rolePermissions = await Permission.findOne({ role: req.user.role });

    if (!rolePermissions) {
      return res.status(403).json({ success: false, message: 'No permissions configured for your role' });
    }

    const resourcePerms = rolePermissions.permissions[resource];
    if (!resourcePerms || !resourcePerms[action]) {
      return res.status(403).json({ success: false, message: `You don't have ${action} permission for ${resource}` });
    }

    next();
  };
};

const workspaceAccess = async (req, res, next) => {
  try {
    const workspaceId = req.headers['x-workspace-id'] || req.user.currentWorkspace?._id;

    if (!workspaceId) {
      return res.status(400).json({ success: false, message: 'Workspace ID required' });
    }

    const Workspace = require('../models/Workspace');
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    const isOwner = workspace.owner.toString() === req.user._id.toString();
    const isMember = workspace.members.some(m => m.user.toString() === req.user._id.toString());

    if (!isOwner && !isMember && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not a member of this workspace' });
    }

    req.workspace = workspace;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Workspace access error' });
  }
};

// Authorize the workspace identified by the :id URL param (prevents cross-tenant IDOR).
// workspaceParamMember: owner, member, or super_admin may proceed.
const workspaceParamMember = async (req, res, next) => {
  try {
    const Workspace = require('../models/Workspace');
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }
    const uid = req.user._id.toString();
    const isOwner = workspace.owner.toString() === uid;
    const isMember = (workspace.members || []).some(m => m.user.toString() === uid);
    if (!isOwner && !isMember && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized for this workspace' });
    }
    req.workspaceDoc = workspace;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Workspace authorization error' });
  }
};

// workspaceParamOwner: only the owner (or super_admin) may proceed.
const workspaceParamOwner = async (req, res, next) => {
  try {
    const Workspace = require('../models/Workspace');
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }
    if (workspace.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    req.workspaceDoc = workspace;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Workspace authorization error' });
  }
};

module.exports = { protect, adminOnly, superAdminOnly, checkPermission, workspaceAccess, workspaceParamMember, workspaceParamOwner };
