const mongoose = require('mongoose');

// Returns the plan of the workspace owner (agents inherit the owner's plan).
const getOwnerPlan = async (req) => {
  const User = require('../models/User');
  const ownerId = req.workspace?.owner || req.user._id;
  const owner = await User.findById(ownerId).populate('plan').lean();
  return owner?.plan || null;
};

// Returns an error message string when the workspace has reached the plan
// limit for `key`, otherwise null. Limit -1 or undefined = unlimited.
const checkPlanLimit = async (req, key, model, query) => {
  try {
    const plan = await getOwnerPlan(req);
    if (!plan || !plan.limits) return null;
    const limit = plan.limits[key];
    if (limit === undefined || limit === null || limit < 0) return null;
    const Model = mongoose.model(model);
    const count = await Model.countDocuments(query || { workspace: req.workspace._id });
    if (count >= limit) {
      return `Your plan allows up to ${limit} ${key}. Upgrade your plan to add more.`;
    }
    return null;
  } catch {
    return null;
  }
};

module.exports = { checkPlanLimit, getOwnerPlan };
