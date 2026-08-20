// Shared helpers for AI voice calling: pick the Azure realtime config and
// build the knowledge base that the phone agent should answer from.
const AIKnowledgeDoc = require('../models/AIKnowledgeDoc');

// Build Azure realtime config from AISettings (+ agent), or null when Azure
// realtime calling is not configured (falls back to OpenAI realtime).
function azureRealtime(ai, agent) {
  if (!ai || ai.provider !== 'azure') return null;
  const deployment = ai.azureRealtimeDeployment
    || (agent && agent.aiModel && /realtime/i.test(agent.aiModel) ? agent.aiModel : '');
  const endpoint = ai.azureRealtimeEndpoint || ai.azureEndpoint;
  if (!deployment || !endpoint) return null;
  return {
    endpoint,
    deployment,
    apiVersion: ai.azureRealtimeApiVersion || '2024-10-01-preview',
    apiKey: ai.azureRealtimeKey || ai.apiKey,
  };
}

// Keep the injected knowledge bounded: a very large system prompt slows down the
// realtime model's first response noticeably, so cap what we send on a call.
const CALL_KNOWLEDGE_MAX = 3000;

// Append the workspace knowledge (AI Settings text + knowledge docs) so the
// phone agent answers with the same knowledge the chat AI has.
async function knowledgeSuffix(workspaceId, ai) {
  let docsText = '';
  try {
    const docs = await AIKnowledgeDoc.find({ workspace: workspaceId }).select('title content').lean();
    docsText = docs
      .map(d => `## ${d.title || ''}\n${d.content || ''}`.trim())
      .filter(Boolean)
      .join('\n\n');
  } catch { /* ignore knowledge fetch failures - call still proceeds */ }
  let knowledge = [ai && ai.knowledgeBase, docsText].filter(Boolean).join('\n\n');
  if (!knowledge) return '';
  if (knowledge.length > CALL_KNOWLEDGE_MAX) knowledge = knowledge.slice(0, CALL_KNOWLEDGE_MAX) + '\n...';
  return '\n\nKNOWLEDGE BASE (use this to answer caller questions accurately):\n' + knowledge;
}

module.exports = { azureRealtime, knowledgeSuffix };
