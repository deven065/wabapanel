const mongoose = require('mongoose');

// One row per (automation, IG user, media) so we never DM the same person twice for the same post,
// and to power basic analytics.
const igAutoDmLogSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'IgAutoDm', required: true },
  mediaId: { type: String, default: '' },
  commentId: { type: String, default: '' },
  igUserId: { type: String, default: '' },
  username: { type: String, default: '' },
  commentText: { type: String, default: '' },
  trigger: { type: String, enum: ['comment', 'mention', 'story_reply', 'dm_keyword'], default: 'comment' },
  stage: { type: String, enum: ['queued', 'retry', 'dm_sent', 'clicked', 'payload_sent', 'failed'], default: 'dm_sent' },
  error: { type: String, default: '' },
  // Queue/retry bookkeeping used by the sender worker.
  dueAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  lastAttemptAt: { type: Date, default: null },
  lastInboundAt: { type: Date, default: null },
  // What makes this row unique for the same user + automation (post id, or trigger+day).
  dedupeKey: { type: String, default: '' },
}, { timestamps: true });

igAutoDmLogSchema.index({ workspace: 1, automation: 1, igUserId: 1, dedupeKey: 1 }, { unique: true });
igAutoDmLogSchema.index({ stage: 1, dueAt: 1 });

module.exports = mongoose.model('IgAutoDmLog', igAutoDmLogSchema);
