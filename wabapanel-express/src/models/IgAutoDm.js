const mongoose = require('mongoose');

// Instagram "Auto DM" automation: when someone comments on a post/reel, auto-send them a DM.
const igAutoDmSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name: { type: String, default: '' },
  active: { type: Boolean, default: true },

  // What starts this automation.
  trigger: { type: String, enum: ['comment', 'mention', 'story_reply', 'dm_keyword'], default: 'comment' },

  // Which media triggers this automation (comment/mention triggers only).
  scope: { type: String, enum: ['specific', 'any'], default: 'any' },
  mediaId: { type: String, default: '' },          // required when scope=specific
  mediaPermalink: { type: String, default: '' },   // for display in the UI
  mediaThumb: { type: String, default: '' },
  mediaCaption: { type: String, default: '' },

  // Comment keyword match.
  keywordMode: { type: String, enum: ['any', 'contains', 'exact'], default: 'contains' },
  keywords: { type: [String], default: [] },

  // Public reply(ies) posted under the comment (rotated to avoid IG spam blocks). Empty = no public reply.
  publicReplies: { type: [String], default: [] },

  // Optional gate: ask the user to follow first. Instagram exposes no follower status,
  // so the user confirms with a button and the payload is sent only after that tap.
  askFollow: { type: Boolean, default: false },
  followText: { type: String, default: '' },
  followButtonText: { type: String, default: '' },

  // Human-like pacing so a viral post does not fire hundreds of DMs at once.
  delayMinSec: { type: Number, default: 5 },
  delayMaxSec: { type: Number, default: 25 },
  hourlyCap: { type: Number, default: 60 },

  // Save the commenter as a contact (they may have no chat yet) with these tags/stage.
  createContact: { type: Boolean, default: false },
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
  stage: { type: mongoose.Schema.Types.ObjectId, ref: 'Stage', default: null },

  // Opening DM (private reply to the comment).
  openingText: { type: String, default: '' },
  // When set, the opening DM shows this as a quick-reply button; the payload is sent after the user taps it.
  buttonText: { type: String, default: '' },

  // The actual content delivered to the customer.
  payload: {
    text: { type: String, default: '' },
    mediaType: { type: String, enum: ['', 'image', 'video'], default: '' },
    mediaUrl: { type: String, default: '' },
    // URL buttons (e.g. link to a PDF / website). IG cannot attach documents, so PDFs go here as a link.
    buttons: { type: [{ title: String, url: String }], default: [] },
  },

  stats: {
    comments: { type: Number, default: 0 },
    dmsSent: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
}, { timestamps: true });

module.exports = mongoose.model('IgAutoDm', igAutoDmSchema);
