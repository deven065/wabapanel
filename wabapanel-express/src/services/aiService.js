const axios = require('axios');

class AIService {
  constructor() {
    this.providers = {
      openai: {
        name: 'OpenAI',
        model: 'gpt-4o',
        baseUrl: 'https://api.openai.com/v1',
      },
      deepseek: {
        name: 'DeepSeek',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1',
      },
      xai: {
        name: 'xAI',
        model: 'grok-beta',
        baseUrl: 'https://api.x.ai/v1',
      },
      gemini: {
        name: 'Google Gemini',
        model: 'gemini-2.5-flash',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      },
      anthropic: {
        name: 'Anthropic Claude',
        model: 'claude-sonnet-4-20250514',
        baseUrl: 'https://api.anthropic.com/v1',
      },
      azure: {
        name: 'Azure OpenAI',
        model: 'gpt-4o',
        baseUrl: '',
      },
    };
  }

  // Build the chat-completions URL + headers for OpenAI-compatible providers.
  // Azure OpenAI uses a per-deployment URL and an `api-key` header instead of Bearer.
  _openAiCompatRequest(provider, apiKey, config, options) {
    if (provider === 'azure') {
      const endpoint = String(options.azureEndpoint || '').replace(/\/+$/, '');
      const deployment = options.azureDeployment || options.model || config.model;
      const apiVersion = options.azureApiVersion || '2024-02-15-preview';
      if (!endpoint || !deployment) {
        throw new Error('Azure OpenAI requires azureEndpoint and azureDeployment');
      }
      return {
        url: `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        sendModel: false,
      };
    }
    return {
      url: `${options.baseUrl || config.baseUrl}/chat/completions`,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      sendModel: true,
    };
  }

  async chat(provider, apiKey, messages, options = {}) {
    const config = this.providers[provider];
    if (!config) {
      throw new Error(`Unknown AI provider: ${provider}`);
    }

    if (provider === 'gemini') {
      return this._geminiChat(apiKey, messages, options);
    }
    if (provider === 'anthropic') {
      return this._anthropicChat(apiKey, messages, options);
    }

    const req = this._openAiCompatRequest(provider, apiKey, config, options);
    const tokenField = this._tokenLimitField(options, config);
    const response = await axios.post(req.url, {
      ...(req.sendModel ? { model: options.model || config.model } : {}),
      messages,
      temperature: options.temperature || 0.7,
      [tokenField]: options.maxTokens || 1000,
      ...options.extra,
    }, { headers: req.headers });

    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage,
    };
  }

  // Like chat(), but returns the raw assistant message (incl. tool_calls).
  async chatRaw(provider, apiKey, messages, options = {}) {
    const config = this.providers[provider];
    if (!config) throw new Error(`Unknown AI provider: ${provider}`);
    const req = this._openAiCompatRequest(provider, apiKey, config, options);
    const tokenField = this._tokenLimitField(options, config);
    const response = await axios.post(req.url, {
      ...(req.sendModel ? { model: options.model || config.model } : {}),
      messages,
      temperature: options.temperature || 0.7,
      [tokenField]: options.maxTokens || 1000,
      ...options.extra,
    }, { headers: req.headers });
    return { message: response.data.choices[0].message, usage: response.data.usage };
  }

  // Newer reasoning models (gpt-5*, o1/o3/o4) reject `max_tokens` and require `max_completion_tokens`.
  _tokenLimitField(options, config) {
    const modelId = String(options.azureDeployment || options.model || (config && config.model) || '').toLowerCase();
    return /gpt-5|(^|[^a-z0-9])o[1-9]/.test(modelId) ? 'max_completion_tokens' : 'max_tokens';
  }

  // Azure option fields pulled from an AISettings document (safe for non-azure too).
  azureOpts(st) {
    if (!st || st.provider !== 'azure') return {};
    return {
      azureEndpoint: st.azureEndpoint,
      azureDeployment: st.azureDeployment,
      azureApiVersion: st.azureApiVersion,
    };
  }

  async _anthropicChat(apiKey, messages, options = {}) {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const rest = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const response = await axios.post(`${this.providers.anthropic.baseUrl}/messages`, {
      model: options.model || this.providers.anthropic.model,
      max_tokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7,
      ...(system ? { system } : {}),
      messages: rest.length ? rest : [{ role: 'user', content: 'Hello' }],
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    });
    return {
      content: response.data.content?.[0]?.text || '',
      usage: response.data.usage,
    };
  }

  async _geminiChat(apiKey, messages, options = {}) {
    // Remap models Google retired from the v1beta generateContent API (they 404).
    const DEAD = {
      'gemini-pro': 'gemini-2.5-flash', 'gemini-1.0-pro': 'gemini-2.5-flash', 'gemini-pro-vision': 'gemini-2.5-flash',
      'gemini-1.5-pro': 'gemini-2.5-flash', 'gemini-1.5-flash': 'gemini-2.5-flash', 'gemini-1.5-flash-8b': 'gemini-2.5-flash',
      'gemini-1.5-pro-latest': 'gemini-2.5-flash', 'gemini-1.5-flash-latest': 'gemini-2.5-flash',
    };
    let model = options.model || 'gemini-2.5-flash';
    if (DEAD[model]) model = DEAD[model];
    const FALLBACK = 'gemini-2.5-flash';
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const body = {
      contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Hello' }] }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    };

    const callModel = (m) => axios.post(
      `${this.providers.gemini.baseUrl}/models/${m}:generateContent?key=${apiKey}`,
      body, { headers: { 'Content-Type': 'application/json' } });

    let response;
    try {
      response = await callModel(model);
    } catch (e) {
      const status = e.response && e.response.status;
      const gmsg = e.response && e.response.data && e.response.data.error && e.response.data.error.message;
      // A retired/misspelled model 404s ("is not found for API version"). Retry once on the current default.
      const modelMissing = status === 404 || /not found|not supported|does not exist/i.test(gmsg || '');
      if (modelMissing && model !== FALLBACK) {
        try {
          response = await callModel(FALLBACK);
          model = FALLBACK;
        } catch (e2) {
          const g2 = e2.response && e2.response.data && e2.response.data.error && e2.response.data.error.message;
          throw new Error(g2 ? `Gemini: ${g2}` : e2.message);
        }
      } else {
        throw new Error(gmsg ? `Gemini: ${gmsg}` : e.message);
      }
    }

    const cand = response.data && response.data.candidates && response.data.candidates[0];
    const parts = cand && cand.content && cand.content.parts;
    const text = Array.isArray(parts) ? parts.map(pt => pt.text).filter(Boolean).join('') : '';
    if (!text) {
      const block = response.data && response.data.promptFeedback && response.data.promptFeedback.blockReason;
      const fin = cand && cand.finishReason;
      throw new Error(block ? `Gemini blocked the request (${block})` : `Gemini returned no text (finishReason: ${fin || 'unknown'})`);
    }
    return {
      content: text,
      usage: response.data.usageMetadata,
    };
  }

  async generateAutoReply(provider, apiKey, contactMessage, context = '') {
    const systemPrompt = `You are a helpful WhatsApp business assistant. ${context}. Reply concisely and helpfully.`;
    return this.chat(provider, apiKey, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contactMessage },
    ]);
  }
}

module.exports = new AIService();
