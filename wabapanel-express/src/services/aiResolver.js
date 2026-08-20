// Resolves the effective AI credentials + knowledge for a workspace.
// Credential order: workspace's own key -> admin per-vendor assignment -> global providers.
const AISettings = require('../models/AISettings');
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');
const WorkspaceKB = require('../models/WorkspaceKB');
const { getWorkspaceKnowledge } = require('./aiKnowledgeExtract');

// Normalise a provider display name (e.g. "OpenAI", "xAI Grok") to the internal key.
function normProvider(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('openai')) return 'openai';
  if (n.includes('deepseek')) return 'deepseek';
  if (n.includes('grok') || n.includes('xai')) return 'xai';
  if (n.includes('gemini') || n.includes('google')) return 'gemini';
  if (n.includes('anthropic') || n.includes('claude')) return 'anthropic';
  if (n.includes('azure')) return 'azure';
  return n || 'openai';
}

// Returns { provider, apiKey, model, azureEndpoint, azureDeployment, azureApiVersion, source } or null.
async function resolveAiCreds(workspace, aiSettings) {
  // 1) Workspace's own key (vendor configured it themselves).
  if (aiSettings && aiSettings.apiKey) {
    return {
      provider: aiSettings.provider,
      apiKey: aiSettings.apiKey,
      model: aiSettings.model,
      azureEndpoint: aiSettings.azureEndpoint,
      azureDeployment: aiSettings.azureDeployment,
      azureApiVersion: aiSettings.azureApiVersion,
      source: 'workspace',
    };
  }
  // 2) Admin per-vendor assignment (vendor = workspace owner).
  const ownerId = workspace && workspace.owner;
  if (ownerId) {
    const owner = await User.findById(ownerId).select('aiAssignment').lean();
    const a = owner && owner.aiAssignment;
    if (a && a.enabled && a.apiKey) {
      const provider = normProvider(a.provider);
      return {
        provider,
        apiKey: a.apiKey,
        model: a.model || (provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o'),
        azureEndpoint: a.endpoint || '',
        azureDeployment: a.deployment || '',
        azureApiVersion: a.apiVersion || '2024-02-15-preview',
        source: 'vendor-admin',
      };
    }
  }
  // 3) Global providers configured by the super admin (/admin/ai).
  const ss = await SystemSettings.findOne().select('ai').lean();
  const providers = (ss && ss.ai && ss.ai.providers) || [];
  const active = providers.find((p) => (p.isActive || p.enabled) && p.apiKey);
  if (active) {
    const provider = normProvider(active.name);
    return {
      provider,
      apiKey: active.apiKey,
      model: active.model || (provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o'),
      azureEndpoint: active.baseUrl || active.endpoint || '',
      azureDeployment: '',
      azureApiVersion: '2024-02-15-preview',
      source: 'global',
    };
  }
  return null;
}

// Active knowledge-base articles from /client/knowledge-base, combined into one capped string.
async function getWorkspaceKbText(workspaceId, maxChars = 12000) {
  const items = await WorkspaceKB.find({ workspace: workspaceId, status: 'active' })
    .select('title content category')
    .sort('-updatedAt')
    .lean();
  let out = '';
  for (const it of items) {
    const block = `\n\n### ${it.title}${it.category ? ` (${it.category})` : ''}\n${it.content || ''}`;
    if (out.length + block.length > maxChars) {
      out += block.slice(0, Math.max(0, maxChars - out.length));
      break;
    }
    out += block;
  }
  return out.trim();
}

// Full knowledge block for the AI system prompt: manual text + KB articles + uploaded docs.
async function buildKnowledgeBlock(workspaceId, aiSettings) {
  const [kbArticles, kbDocs] = await Promise.all([
    getWorkspaceKbText(workspaceId).catch(() => ''),
    getWorkspaceKnowledge(workspaceId).catch(() => ''),
  ]);
  const parts = [aiSettings && aiSettings.knowledgeBase, kbArticles, kbDocs].filter(Boolean);
  if (!parts.length) return '';
  return '\n\nKnowledge Base:\n' + parts.join('\n\n');
}

module.exports = { resolveAiCreds, getWorkspaceKbText, buildKnowledgeBlock, normProvider };
