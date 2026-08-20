const Pipeline = require('../models/Pipeline');

const getPipelines = async (req, res) => {
  try {
    const pipelines = await Pipeline.find({ workspace: req.workspace._id }).populate('deals.contact', 'name phone').populate('deals.assignedTo', 'name');
    res.json({ success: true, data: pipelines });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.findOne({ _id: req.params.id, workspace: req.workspace._id })
      .populate('deals.contact', 'name phone')
      .populate('deals.assignedTo', 'name');
    if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });
    res.json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createPipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.create({
      ...req.body,
      workspace: req.workspace._id,
      createdBy: req.user._id,
      stages: req.body.stages || [
        { id: 'lead', name: 'Lead', color: '#3B82F6', order: 0 },
        { id: 'qualified', name: 'Qualified', color: '#F59E0B', order: 1 },
        { id: 'proposal', name: 'Proposal', color: '#8B5CF6', order: 2 },
        { id: 'negotiation', name: 'Negotiation', color: '#EC4899', order: 3 },
        { id: 'won', name: 'Won', color: '#10B981', order: 4 },
      ],
    });
    res.status(201).json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updatePipeline = async (req, res) => {
  try {
    const pipeline = await Pipeline.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true }
    );
    if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });
    res.json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deletePipeline = async (req, res) => {
  try {
    await Pipeline.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true, message: 'Pipeline deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addDeal = async (req, res) => {
  try {
    const pipeline = await Pipeline.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });

    pipeline.deals.push(req.body);
    await pipeline.save();
    res.status(201).json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateDeal = async (req, res) => {
  try {
    const pipeline = await Pipeline.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });

    const deal = pipeline.deals.id(req.params.dealId);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });

    const oldStage = deal.stage;
    Object.assign(deal, req.body);
    await pipeline.save();
    if (deal.stage && deal.stage !== oldStage) {
      const Contact = require('../models/Contact');
      const contact = deal.contact ? await Contact.findById(deal.contact).select('name phone').lean() : null;
      require('../services/ownerNotify')
        .leadStageChange(req.workspace._id, contact || { name: deal.title }, deal.title || 'Deal', oldStage, deal.stage)
        .catch(() => {});
    }
    res.json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDeal = async (req, res) => {
  try {
    const pipeline = await Pipeline.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!pipeline) return res.status(404).json({ success: false, message: 'Pipeline not found' });

    pipeline.deals.pull(req.params.dealId);
    await pipeline.save();
    res.json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getPipelines, getPipeline, createPipeline, updatePipeline, deletePipeline, addDeal, updateDeal, deleteDeal };
