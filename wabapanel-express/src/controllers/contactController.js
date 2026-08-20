const Contact = require('../models/Contact');
const { checkPlanLimit } = require('../utils/planLimits');
const Tag = require('../models/Tag');
const { sendPaginated } = require('../utils/apiResponse');

// @GET /api/contacts
const getContacts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, tag, segment, status, channel, source, sort = '-createdAt' } = req.query;
    const query = { workspace: req.workspace._id, isGroup: { $ne: true } };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (tag) query.tags = tag;
    if (segment) query.segments = segment;
    if (status) query.status = status;
    if (channel) query.channel = channel;
    if (source) query.source = source;

    const total = await Contact.countDocuments(query);
    const contacts = await Contact.find(query)
      .populate('tags', 'name color')
      .populate('badges', 'name color icon')
      .populate('assignedAgent', 'name email')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Attach each contact's current pipeline + stage (open deals preferred).
    try {
      const Pipeline = require('../models/Pipeline');
      const ids = contacts.map((c) => c._id);
      if (ids.length) {
        const pipelines = await Pipeline.find(
          { workspace: req.workspace._id, 'deals.contact': { $in: ids } },
          { name: 1, stages: 1, 'deals.contact': 1, 'deals.stage': 1, 'deals.status': 1 }
        ).lean();
        const stageMap = new Map();
        for (const pl of pipelines) {
          const stageName = (s) => {
            const st = (pl.stages || []).find((x) => x.id === s || x.name === s);
            return st ? st.name : s;
          };
          for (const d of pl.deals || []) {
            if (!d.contact) continue;
            const cid = String(d.contact);
            const existing = stageMap.get(cid);
            if (!existing || (existing.status !== 'open' && d.status === 'open')) {
              stageMap.set(cid, { pipeline: pl.name, stage: stageName(d.stage), status: d.status });
            }
          }
        }
        for (const c of contacts) {
          c.pipelineStage = stageMap.get(String(c._id)) || null;
        }
      }
    } catch (e) { /* pipeline lookup best-effort */ }

    sendPaginated(res, contacts, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/contacts
const createContact = async (req, res) => {
  try {
    const limitMsg = await checkPlanLimit(req, 'contacts', 'Contact');
    if (limitMsg) return res.status(403).json({ success: false, message: limitMsg });
    const contact = await Contact.create({
      ...req.body,
      workspace: req.workspace._id,
    });

    // Update tag counts
    if (req.body.tags && req.body.tags.length > 0) {
      await Tag.updateMany(
        { _id: { $in: req.body.tags } },
        { $inc: { contactCount: 1 } }
      );
    }

    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Contact with this phone number already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/contacts/:id
const getContact = async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    })
      .populate('tags', 'name color')
      .populate('badges', 'name color icon')
      .populate('segments', 'name')
      .populate('assignedAgent', 'name email avatar');

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/contacts/:id
const updateContact = async (req, res) => {
  try {
    const before = req.body.tags
      ? await Contact.findOne({ _id: req.params.id, workspace: req.workspace._id }).populate('tags', 'name').lean()
      : null;
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true, runValidators: true }
    ).populate('tags', 'name color').populate('badges', 'name color icon');

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    if (before) {
      const names = (list) => (list || []).map((t) => t?.name).filter(Boolean);
      const oldTags = names(before.tags);
      const newTags = names(contact.tags);
      const added = newTags.filter((t) => !oldTags.includes(t));
      const removed = oldTags.filter((t) => !newTags.includes(t));
      if (added.length || removed.length) {
        require('../services/ownerNotify').tagChangeAlert(req.workspace._id, contact, added, removed).catch(() => {});
      }
    }

    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/contacts/:id
const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    // Update tag counts
    if (contact.tags.length > 0) {
      await Tag.updateMany(
        { _id: { $in: contact.tags } },
        { $inc: { contactCount: -1 } }
      );
    }

    // Cascade: remove this contact's conversations + messages so no orphaned
    // ("Unknown", no-number) chats are left behind in any channel inbox.
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    await Message.deleteMany({ workspace: req.workspace._id, contact: contact._id });
    await Conversation.deleteMany({ workspace: req.workspace._id, contact: contact._id });

    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/contacts/import
// Parse a date string that may be dd-mm-yyyy (or dd/mm/yyyy) or yyyy-mm-dd.
function parseFlexibleDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) { const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return isNaN(d) ? null : d; }
  m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return isNaN(d) ? null : d; }
  const d = new Date(s); return isNaN(d) ? null : d;
}
function fmtDMY(d) {
  if (!d) return '';
  const dt = new Date(d); if (isNaN(dt)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return pad(dt.getUTCDate()) + '-' + pad(dt.getUTCMonth() + 1) + '-' + dt.getUTCFullYear();
}

const importContacts = async (req, res) => {
  try {
    let contacts = req.body.contacts;

    // Parse CSV file if uploaded
    if (req.file) {
      const csvText = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
      const lines = csvText.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        return res.status(400).json({ success: false, message: 'CSV file is empty or has no data rows' });
      }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      contacts = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
        if (obj.phone || obj.mobile || obj.number) {
          contacts.push({
            name: obj.name || obj.first_name || obj.contact_name || '',
            phone: String(obj.phone || obj.mobile || obj.number || '').replace(/[^0-9]/g, ''),
            email: obj.email || obj.mail || '',
            tagNames: String(obj.tags || obj.labels || '').split(/[;|]/).map((t) => t.trim()).filter(Boolean),
            stageName: String(obj.stage || obj.pipeline_stage || '').trim(),
            segmentNames: String(obj.segments || obj.segment || obj.category || obj.group || obj.groups || '').split(/[;|]/).map((t) => t.trim()).filter(Boolean),
            birthdayStr: obj.birthday || obj.dob || '',
            anniversaryStr: obj.anniversary || '',
            rawFields: obj,
          });
        }
      }
    }

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid contacts found. CSV must have columns: name, phone, email' });
    }

    const results = { created: 0, updated: 0, failed: 0, errors: [] };

    const Tag = require('../models/Tag');
    const Stage = require('../models/Stage');
    const Segment = require('../models/Segment');
    const DataField = require('../models/DataField');
    const dataFields = await DataField.find({ workspace: req.workspace._id, isActive: true }).lean();
    for (const c of contacts) {
      try {
        const { tagNames, stageName, segmentNames, birthdayStr, anniversaryStr, rawFields, ...base } = c;
        const doc = { ...base, workspace: req.workspace._id, source: 'import' };
        const _bd = parseFlexibleDate(birthdayStr); if (_bd) doc.birthday = _bd;
        const _an = parseFlexibleDate(anniversaryStr); if (_an) doc.anniversary = _an;
        if (rawFields && dataFields.length) {
          const custom = {};
          for (const f of dataFields) {
            const v = rawFields[f.name.toLowerCase()] ?? rawFields[f.label.toLowerCase()];
            if (v !== undefined && v !== '') custom[f.name] = v;
          }
          if (Object.keys(custom).length) doc.customFields = custom;
        }
        if (tagNames && tagNames.length) {
          const ids = [];
          for (const tn of tagNames) {
            const t = await Tag.findOneAndUpdate(
              { workspace: req.workspace._id, name: tn },
              { $setOnInsert: { workspace: req.workspace._id, name: tn } },
              { upsert: true, new: true }
            );
            ids.push(t._id);
          }
          doc.tags = ids;
        }
        if (stageName) {
          const st = await Stage.findOneAndUpdate(
            { workspace: req.workspace._id, name: stageName },
            { $setOnInsert: { workspace: req.workspace._id, name: stageName } },
            { upsert: true, new: true }
          );
          doc.stage = st._id;
        }
        if (segmentNames && segmentNames.length) {
          const sids = [];
          for (const sn of segmentNames) {
            const sg = await Segment.findOneAndUpdate(
              { workspace: req.workspace._id, name: sn },
              { $setOnInsert: { workspace: req.workspace._id, name: sn } },
              { upsert: true, new: true }
            );
            sids.push(sg._id);
          }
          doc.segments = sids;
        }
        await Contact.findOneAndUpdate(
          { workspace: req.workspace._id, phone: c.phone },
          doc,
          { upsert: true, new: true }
        );
        results.created++;
      } catch (err) {
        results.failed++;
        results.errors.push({ phone: c.phone, error: err.message });
      }
    }

    res.json({ success: true, data: results, message: `Imported ${results.created} contact(s)${results.failed ? `, ${results.failed} failed` : ''}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/contacts/export
const exportContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({ workspace: req.workspace._id, isGroup: { $ne: true } })
      .populate('tags', 'name')
      .populate('stage', 'name')
      .populate('segments', 'name')
      .lean();

    const DataField = require('../models/DataField');
    const dataFields = await DataField.find({ workspace: req.workspace._id, isActive: true }).sort('order').lean();

    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const fmtDate = (d) => fmtDMY(d);
    const headers = ['name', 'phone', 'email', 'birthday', 'anniversary', 'tags', 'stage', 'segments', 'status', 'source', ...dataFields.map((f) => f.name)].join(',');
    const rows = contacts.map(c => {
      const tags = (c.tags || []).map(t => typeof t === 'object' ? t.name : t).join(';');
      const stage = c.stage && typeof c.stage === 'object' ? c.stage.name : '';
      const segments = (c.segments || []).map(sg => typeof sg === 'object' ? sg.name : sg).join(';');
      const base = [c.name, c.phone, c.email, fmtDate(c.birthday), fmtDate(c.anniversary), tags, stage, segments, c.status, c.source];
      const custom = dataFields.map((f) => (c.customFields || {})[f.name]);
      return [...base, ...custom].map(esc).join(',');
    });
    const csv = [headers, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/contacts/bulk-delete
const bulkDeleteContacts = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No contact IDs provided' });
    }

    const result = await Contact.deleteMany({
      _id: { $in: ids },
      workspace: req.workspace._id,
    });

    if (result.deletedCount > 1) {
      require('../services/ownerNotify')
        .bulkDeleteAlert(req.workspace._id, req.user || {}, result.deletedCount, 'contacts')
        .catch(() => {});
    }

    res.json({ success: true, message: `${result.deletedCount} contacts deleted`, data: { deletedCount: result.deletedCount } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getContacts, createContact, getContact, updateContact,
  deleteContact, importContacts, exportContacts, bulkDeleteContacts,
};
