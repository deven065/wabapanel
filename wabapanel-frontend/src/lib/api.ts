import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;

    const workspaceId = localStorage.getItem('workspaceId');
    if (workspaceId) config.headers['x-workspace-id'] = workspaceId;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const reqUrl = (error.config && error.config.url) || '';
    const isAuthRequest = /\/auth\/(login|admin\/login|register)/.test(reqUrl);
    if (error.response?.status === 401 && !isAuthRequest) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('workspaceId');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const pushApi = {
  vapidPublicKey: () => api.get('/push/vapid-public-key'),
  subscribe: (data: { endpoint: string; keys: { p256dh: string; auth: string } }) => api.post('/push/subscribe', data),
  unsubscribe: (endpoint: string) => api.post('/push/unsubscribe', { endpoint }),
};

// Auth
export const authApi = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  adminLogin: (data: { email: string; password: string }) => api.post('/auth/admin/login', data),
  register: (data: { name: string; email: string; password: string }) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data: Partial<{ name: string; phone: string; avatar: string }>) => api.put('/auth/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) => api.put('/auth/change-password', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }),
  resendVerification: (email: string) => api.post('/auth/resend-verification', { email }),
  resetPassword: (data: { token: string; password: string }) => api.post('/auth/reset-password', data),
  switchWorkspace: (workspaceId: string) => api.put(`/auth/switch-workspace/${workspaceId}`),
  // 2FA
  twoFactorStatus: () => api.get('/auth/2fa/status'),
  twoFactorSetup: (method: 'app' | 'email') => api.post('/auth/2fa/setup', { method }),
  twoFactorVerify: (code: string) => api.post('/auth/2fa/verify', { code }),
  twoFactorResend: () => api.post('/auth/2fa/resend'),
  twoFactorDisable: (password?: string) => api.post('/auth/2fa/disable', { password }),
  twoFactorLoginVerify: (data: { challengeToken: string; code: string }) => api.post('/auth/2fa/login-verify', data),
  twoFactorLoginResend: (challengeToken: string) => api.post('/auth/2fa/login-resend', { challengeToken }),
};

export const tgPersonalApi = {
  connectQr: () => api.post('/tgpersonal/connect-qr', {}),
  connect: (phone: string, apiId?: string, apiHash?: string) => api.post('/tgpersonal/connect', { apiId, apiHash, phone }),
  code: (code: string) => api.post('/tgpersonal/code', { code }),
  password: (password: string) => api.post('/tgpersonal/password', { password }),
  status: () => api.get('/tgpersonal/status'),
  disconnect: () => api.post('/tgpersonal/disconnect', {}),
};

// Workspaces
export const waqrApi = {
  connect: () => api.post('/waqr/connect', {}),
  status: () => api.get('/waqr/status'),
  sync: () => api.post('/waqr/sync', {}),
  settings: (dailyLimit: number) => api.post('/waqr/settings', { dailyLimit }),
  sendNew: (phone: string, text: string) => api.post('/waqr/send-new', { phone, text }),
  disconnect: () => api.post('/waqr/disconnect', {}),
};

export const workspaceApi = {
  list: () => api.get('/workspaces'),
  get: (id: string) => api.get(`/workspaces/${id}`),
  create: (data: { name: string }) => api.post('/workspaces', data),
  update: (id: string, data: object) => api.put(`/workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
  addMember: (id: string, data: { email: string; role: string }) => api.post(`/workspaces/${id}/members`, data),
  removeMember: (id: string, userId: string) => api.delete(`/workspaces/${id}/members/${userId}`),
  updateWhatsApp: (id: string, data: object) => api.put(`/workspaces/${id}/whatsapp`, data),
  getWhatsAppSignupConfig: (id: string) => api.get(`/workspaces/${id}/whatsapp/embedded-signup/config`),
  refreshWhatsAppDetails: (id: string) => api.post(`/workspaces/${id}/whatsapp/refresh`),
  getWhatsAppHealth: (id: string) => api.get(`/workspaces/${id}/whatsapp/health`),
  embeddedSignup: (id: string, data: object) => api.post(`/workspaces/${id}/whatsapp/embedded-signup`, data),
  generateApiKey: (id: string) => api.post(`/workspaces/${id}/api-key`),
  listApiWebhooks: (id: string) => api.get(`/workspaces/${id}/api-webhooks`),
  addApiWebhook: (id: string, data: { url: string; events: string[] }) => api.post(`/workspaces/${id}/api-webhooks`, data),
  deleteApiWebhook: (id: string, hookId: string) => api.delete(`/workspaces/${id}/api-webhooks/${hookId}`),
};

// Contacts
export const contactApi = {
  list: (params?: Record<string, unknown>) => api.get('/contacts', { params }),
  get: (id: string) => api.get(`/contacts/${id}`),
  create: (data: object) => api.post('/contacts', data),
  update: (id: string, data: object) => api.put(`/contacts/${id}`, data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
  import: (formData: FormData) => api.post('/contacts/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  export: () => api.get('/contacts/export', { responseType: 'blob' }),
  bulkDelete: (ids: string[]) => api.post('/contacts/bulk-delete', { ids }),
};

// Segments
export const segmentApi = {
  list: () => api.get('/segments'),
  get: (id: string) => api.get(`/segments/${id}`),
  create: (data: object) => api.post('/segments', data),
  update: (id: string, data: object) => api.put(`/segments/${id}`, data),
  delete: (id: string) => api.delete(`/segments/${id}`),
  getContacts: (id: string) => api.get(`/segments/${id}/contacts`),
};

// Tags
export const tagApi = {
  list: () => api.get('/tags'),
  create: (data: { name: string; color: string }) => api.post('/tags', data),
  update: (id: string, data: object) => api.put(`/tags/${id}`, data),
  delete: (id: string) => api.delete(`/tags/${id}`),
};

// Templates
export const templateApi = {
  list: (params?: Record<string, unknown>) => api.get('/templates', { params }),
  get: (id: string) => api.get(`/templates/${id}`),
  create: (data: object) => api.post('/templates', data),
  update: (id: string, data: object) => api.put(`/templates/${id}`, data),
  delete: (id: string) => api.delete(`/templates/${id}`),
  syncFromWhatsApp: () => api.post('/templates/sync'),
};

// Campaigns
export const campaignApi = {
  list: (params?: Record<string, unknown>) => api.get('/campaigns', { params }),
  get: (id: string) => api.get(`/campaigns/${id}`),
  create: (data: object) => api.post('/campaigns', data),
  update: (id: string, data: object) => api.put(`/campaigns/${id}`, data),
  delete: (id: string) => api.delete(`/campaigns/${id}`),
  start: (id: string) => api.post(`/campaigns/${id}/start`),
  schedule: (id: string, data: { scheduledAt: string; recurrence: string }) => api.post(`/campaigns/${id}/schedule`, data),
  pause: (id: string) => api.post(`/campaigns/${id}/pause`),
  abResults: (id: string) => api.get(`/campaigns/${id}/ab-results`),
  report: (id: string) => api.get(`/campaigns/${id}/report`),
  resendFailed: (id: string, opts?: { templateId?: string; audience?: string }) => api.post(`/campaigns/${id}/resend-failed`, opts || {}),
};

// Smart Broadcast (advanced: utility template + send-time variable filling)
export const smartBroadcastApi = {
  templates: () => api.get('/smart-broadcast/templates'),
  createTemplate: (data: object) => api.post('/smart-broadcast/templates', data),
  updateTemplate: (id: string, data: object) => api.put(`/smart-broadcast/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/smart-broadcast/templates/${id}`),
  send: (data: object) => api.post('/smart-broadcast/send', data),
  stopCampaign: (id: string) => api.post(`/smart-broadcast/campaigns/${id}/stop`),
  reports: () => api.get('/smart-broadcast/reports'),
};

// Save Money preset messages
export const presetMessageApi = {
  list: () => api.get('/preset-messages'),
  eligibleCount: () => api.get('/preset-messages/eligible-count'),
  create: (data: object) => api.post('/preset-messages', data),
  update: (id: string, data: object) => api.put(`/preset-messages/${id}`, data),
  delete: (id: string) => api.delete(`/preset-messages/${id}`),
};

// Automations
export const automationApi = {
  getSettings: () => api.get('/automations/settings'),
  updateSettings: (data: object) => api.put('/automations/settings', data),
  syncIcebreakers: () => api.post('/automations/settings/icebreakers/sync'),
  feedbackReport: () => api.get('/automations/feedback-report'),
  list: () => api.get('/automations'),
  get: (id: string) => api.get(`/automations/${id}`),
  create: (data: object) => api.post('/automations', data),
  update: (id: string, data: object) => api.put(`/automations/${id}`, data),
  delete: (id: string) => api.delete(`/automations/${id}`),
  toggle: (id: string) => api.patch(`/automations/${id}/toggle`),
};

// Conversations
export const conversationApi = {
  searchMessages: (q: string, conversation?: string) => api.get('/conversations/search-messages', { params: { q, conversation } }),
  exportChat: (id: string, format = 'csv') => api.get(`/conversations/${id}/export`, { params: { format }, responseType: 'blob' }),
  exportAllChats: (format = 'csv') => api.get('/conversations/export-all', { params: { format }, responseType: 'blob' }),
  list: (params?: Record<string, unknown>) => api.get('/conversations', { params }),
  get: (id: string) => api.get(`/conversations/${id}`),
  getMessages: (id: string, params?: Record<string, unknown>) => api.get(`/conversations/${id}/messages`, { params }),
  sendMessage: (id: string, data: object) => api.post(`/conversations/${id}/messages`, data),
  react: (id: string, messageId: string, emoji: string) => api.post(`/conversations/${id}/react`, { messageId, emoji }),
  subscribePresence: (id: string) => api.post(`/conversations/${id}/presence`),
  assign: (id: string, agentId: string) => api.patch(`/conversations/${id}/assign`, { agentId }),
  resolve: (id: string) => api.patch(`/conversations/${id}/resolve`),
  aiSummary: (id: string) => api.post(`/conversations/${id}/ai-summary`),
  sendInvoice: (id: string, data: Record<string, unknown>) => api.post(`/conversations/${id}/send-invoice`, data),
  startNew: (data: { contactId: string }) => api.post('/conversations', data),
  toggleAI: (id: string, enabled: boolean, mode?: 'chat' | 'call') => api.patch(`/conversations/${id}/ai-toggle`, { enabled, mode }),
  pin: (id: string, pinned: boolean) => api.patch(`/conversations/${id}/pin`, { pinned }),
  stickerLibrary: () => api.get('/conversations/stickers/library'),
};

export const paymentLinkApi = {
  list: (conversationId: string) => api.get('/payment-links', { params: { conversation: conversationId } }),
  create: (data: { conversationId: string; amount: number; description?: string; method: string; upiId?: string; currency?: string; onSuccessText?: string; onSuccessFileUrl?: string; onFailureText?: string }) => api.post('/payment-links', data),
  markPaid: (id: string) => api.put(`/payment-links/${id}/mark-paid`),
  cancel: (id: string) => api.delete(`/payment-links/${id}`),
};

export const followupApi = {
  list: () => api.get('/followups'),
  draft: (conversationId: string) => api.post(`/followups/${conversationId}/draft`),
};

export const crmApi = {
  summary: () => api.get('/crm/summary'),
  contacts: (params?: { search?: string; page?: number }) => api.get('/crm/contacts', { params }),
  timeline: (contactId: string, msgBefore?: string) => api.get(`/crm/timeline/${contactId}`, { params: msgBefore ? { msgBefore } : {} }),
  followups: () => api.get('/crm/followups'),
  calls: (params?: { search?: string; status?: string; disposition?: string; direction?: string; from?: string; to?: string; page?: number }) => api.get('/crm/calls', { params }),
  leads: (params?: { search?: string; page?: number; dir?: string; from?: string; to?: string; tag?: string; stage?: string; closed?: string; valueMin?: string; valueMax?: string; reminder?: string; agent?: string; sort?: string; sortBy?: string; sortDir?: string; callStatus?: string; aging?: string }) => api.get('/crm/leads', { params }),
  updateFollowup: (id: string, data: { contactedRemark?: string; contacted?: boolean }) => api.patch(`/crm/followups/${id}`, data),
  leadStats: () => api.get('/crm/leads/stats'),
  leadAgents: () => api.get('/crm/lead-agents'),
  updateLeadComment: (contactId: string, comment: string) => api.patch(`/crm/leads/${contactId}/comment`, { comment }),
  closeLead: (contactId: string, reason: string) => api.patch(`/crm/leads/${contactId}/close`, { reason }),
  reopenLead: (contactId: string) => api.patch(`/crm/leads/${contactId}/reopen`),
  logCall: (contactId: string, body: { status: string; disposition?: string; note?: string; callbackAt?: string }) => api.patch(`/crm/leads/${contactId}/call`, body),
  aiAssist: (data: { instruction: string; contactIds?: string[]; dryRun: boolean; allowSend: boolean; plan?: unknown[] }) => api.post('/crm/leads/ai-assist', data),
  aiHistory: () => api.get('/crm/ai-assist/history'),
  aiSchedules: () => api.get('/crm/ai-assist/schedules'),
  createAiSchedule: (data: { name?: string; instruction: string; allowSend?: boolean; scope?: string; mode?: string; intervalMinutes?: number; dailyTime?: string; active?: boolean }) => api.post('/crm/ai-assist/schedules', data),
  updateAiSchedule: (id: string, data: Record<string, unknown>) => api.put(`/crm/ai-assist/schedules/${id}`, data),
  deleteAiSchedule: (id: string) => api.delete(`/crm/ai-assist/schedules/${id}`),
  runAiSchedule: (id: string) => api.post(`/crm/ai-assist/schedules/${id}/run`, {}),
  dashboard: (params?: { from?: string; to?: string }) => api.get('/crm/dashboard', { params }),
  stages: () => api.get('/crm/stages'),
  createStage: (data: { name: string; color?: string }) => api.post('/crm/stages', data),
  updateStage: (id: string, data: { name?: string; color?: string; order?: number }) => api.put(`/crm/stages/${id}`, data),
  deleteStage: (id: string) => api.delete(`/crm/stages/${id}`),
  setLeadStage: (contactId: string, stage: string | null) => api.patch(`/crm/leads/${contactId}/stage`, { stage }),
  setLeadStages: (contactId: string, stages: string[]) => api.patch(`/crm/leads/${contactId}/stage`, { stages }),
  setLeadValue: (contactId: string, data: { value?: number | null; items?: number | null }) => api.patch(`/crm/leads/${contactId}/value`, data),
  leadSummary: (contactId: string, force?: boolean) => api.post(`/crm/leads/${contactId}/summary`, { force: !!force }),
  callStats: () => api.get('/crm/calls/stats'),
  updateCall: (id: string, data: { disposition?: string; note?: string; followUpAt?: string | null }, source?: string) => api.patch(`/crm/calls/${id}`, data, { params: source ? { source } : {} }),
};

export const noteApi = {
  list: (contactId: string) => api.get('/contact-notes', { params: { contact: contactId } }),
  create: (data: { contact: string; text: string; remindAt?: string }) => api.post('/contact-notes', data),
  update: (id: string, data: { text?: string; remindAt?: string | null; contacted?: boolean; contactedRemark?: string }) => api.put(`/contact-notes/${id}`, data),
  delete: (id: string) => api.delete(`/contact-notes/${id}`),
};

// Dashboard
export const dashboardApi = {
  getClientDashboard: () => api.get('/dashboard/client'),
  getAdminDashboard: () => api.get('/dashboard/admin'),
};

// Pipelines
export const pipelineApi = {
  list: () => api.get('/pipelines'),
  get: (id: string) => api.get(`/pipelines/${id}`),
  create: (data: object) => api.post('/pipelines', data),
  update: (id: string, data: object) => api.put(`/pipelines/${id}`, data),
  delete: (id: string) => api.delete(`/pipelines/${id}`),
  addDeal: (id: string, data: object) => api.post(`/pipelines/${id}/deals`, data),
  updateDeal: (id: string, dealId: string, data: object) => api.put(`/pipelines/${id}/deals/${dealId}`, data),
  deleteDeal: (id: string, dealId: string) => api.delete(`/pipelines/${id}/deals/${dealId}`),
};

// Forms
export const formApi = {
  list: () => api.get('/forms'),
  get: (id: string) => api.get(`/forms/${id}`),
  create: (data: object) => api.post('/forms', data),
  update: (id: string, data: object) => api.put(`/forms/${id}`, data),
  delete: (id: string) => api.delete(`/forms/${id}`),
  publishFlow: (id: string) => api.post(`/forms/${id}/publish-flow`),
  sendFlow: (id: string, conversationId: string) => api.post(`/forms/${id}/send-flow`, { conversationId }),
};

// Short Links
export const shortLinkApi = {
  list: () => api.get('/short-links'),
  create: (data: object) => api.post('/short-links', data),
  update: (id: string, data: object) => api.put(`/short-links/${id}`, data),
  delete: (id: string) => api.delete(`/short-links/${id}`),
};

// Appointments
export const appointmentApi = {
  list: (params?: Record<string, unknown>) => api.get('/appointments', { params }),
  get: (id: string) => api.get(`/appointments/${id}`),
  create: (data: object) => api.post('/appointments', data),
  update: (id: string, data: object) => api.put(`/appointments/${id}`, data),
  delete: (id: string) => api.delete(`/appointments/${id}`),
  sendReminder: (id: string) => api.post(`/appointments/${id}/reminder`),
  reschedule: (id: string, data: object) => api.post(`/appointments/${id}/reschedule`, data),
  cancel: (id: string) => api.post(`/appointments/${id}/cancel`),
  getAvailability: () => api.get('/appointments/availability'),
  updateAvailability: (data: object) => api.put('/appointments/availability', data),
  getSlots: (date: string) => api.get('/appointments/slots', { params: { date } }),
};

// Integrations
export const integrationApi = {
  list: () => api.get('/integrations'),
  connect: (data: object) => api.post('/integrations/connect', data),
  disconnect: (type: string) => api.post('/integrations/' + type + '/disconnect'),
  syncSettings: (type: string, data: object) => api.put('/integrations/' + type + '/sync-settings', data),
  sync: (type: string) => api.post('/integrations/' + type + '/sync'),
  setup: (type: string) => api.get('/integrations/' + type + '/setup'),
  submitTemplate: (type: string, presetKey: string) => api.post(`/integrations/${type}/templates/${presetKey}/submit`),
  addTemplate: (type: string, data: object) => api.post(`/integrations/${type}/templates`, data),
  updateTemplate: (type: string, presetKey: string, data: object) => api.put(`/integrations/${type}/templates/${presetKey}`, data),
  deleteTemplate: (type: string, presetKey: string) => api.delete(`/integrations/${type}/templates/${presetKey}`),
  automation: (type: string, data: object) => api.put('/integrations/' + type + '/automation', data),
  allLeads: (params?: object) => api.get('/integrations/leads/all', { params }),
};

// AI Settings
export const aiSettingsApi = {
  get: () => api.get('/ai-settings'),
  update: (data: object) => api.put('/ai-settings', data),
  test: () => api.post('/ai-settings/test'),
  stats: () => api.get('/ai-settings/stats'),
  listKnowledgeDocs: () => api.get('/ai-settings/knowledge-docs'),
  uploadKnowledgeDoc: (formData: FormData) => api.post('/ai-settings/knowledge-docs', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteKnowledgeDoc: (id: string) => api.delete(`/ai-settings/knowledge-docs/${id}`),
};

// Chat Appearance
export const chatAppearanceApi = {
  get: () => api.get('/chat-appearance'),
  update: (data: object) => api.put('/chat-appearance', data),
  getEmbedCode: () => api.get('/chat-appearance/embed-code'),
};

// Teams
export const teamApi = {
  performance: () => api.get('/teams/performance'),
  list: () => api.get('/teams'),
  get: (id: string) => api.get(`/teams/${id}`),
  create: (data: object) => api.post('/teams', data),
  update: (id: string, data: object) => api.put(`/teams/${id}`, data),
  delete: (id: string) => api.delete(`/teams/${id}`),
  listAgents: () => api.get('/teams/agents'),
  addAgent: (data: object) => api.post('/teams/agents', data),
  updateAgent: (id: string, data: object) => api.put(`/teams/agents/${id}`, data),
  removeAgent: (id: string) => api.delete(`/teams/agents/${id}`),
  loginAsAgent: (id: string) => api.post(`/teams/agents/${id}/login-as`),
};

// Payments
export const paymentApi = {
  subscribe: (planId: string, gateway: string, extra?: { reference?: string; proofUrl?: string; description?: string; couponCode?: string; autoRenew?: boolean; cycle?: 'monthly' | 'quarterly' | 'yearly'; currency?: string }) => api.post('/payments/subscribe', { planId, gateway, ...(extra || {}) }),
  startTrial: (planId: string) => api.post('/payments/start-trial', { planId }),
  verifyPayment: (data: object) => api.post('/payments/verify', data),
  verifyHostedPayment: (paymentId: string) => api.post('/payments/hosted/verify', { paymentId }),
  topUpWallet: (data: { amount: number; gateway: string; reference?: string; proofUrl?: string; description?: string; autoRenew?: boolean }) => api.post('/payments/wallet/topup', data),
  verifyWalletTopup: (data: object) => api.post('/payments/wallet/verify', data),
  getAutoRenewStatus: () => api.get('/payments/auto-renew'),
  cancelAutoRenew: (type: 'plan' | 'wallet') => api.post('/payments/auto-renew/cancel', { type }),
  getHistory: () => api.get('/payments/history'),
  deleteHistory: (id: string) => api.delete(`/payments/history/${id}`),
  getWalletHistory: () => api.get('/payments/wallet/history'),
  getPlans: () => api.get('/payments/plans'),
  getGateways: (currency?: string) => api.get('/payments/gateways', { params: currency ? { currency } : {} }),
  getCurrencies: () => api.get('/payments/currencies'),
  createOrder: (data: object) => api.post('/payments/order', data),
  downloadInvoice: (id: string) => api.get(`/payments/invoice/${id}`, { responseType: 'blob' }),
};

// Catalogs
export const catalogApi = {
  getProducts: () => api.get('/catalogs'),
  getProduct: (id: string) => api.get(`/catalogs/${id}`),
  createProduct: (data: object) => api.post('/catalogs', data),
  updateProduct: (id: string, data: object) => api.put(`/catalogs/${id}`, data),
  deleteProduct: (id: string) => api.delete(`/catalogs/${id}`),
  share: (data: { contactId: string; productId?: string }) => api.post('/catalogs/share', data),
  sync: () => api.post('/catalogs/sync', {}),
};

// Orders
export const orderApi = {
  getOrders: (params?: Record<string, unknown>) => api.get('/orders', { params }),
  getOrder: (id: string) => api.get(`/orders/${id}`),
  updateOrder: (id: string, data: object) => api.put(`/orders/${id}`, data),
  deleteOrder: (id: string) => api.delete(`/orders/${id}`),
};

// Facebook Leads
export const facebookLeadApi = {
  getLeads: (params?: Record<string, unknown>) => api.get('/facebook-leads', { params }),
  getLead: (id: string) => api.get(`/facebook-leads/${id}`),
  syncLeads: () => api.post('/facebook-leads/sync'),
  updateLead: (id: string, data: object) => api.put(`/facebook-leads/${id}`, data),
};

// Keywords
export const botFlowApi = {
  list: () => api.get('/bot-flows'),
  get: (id: string) => api.get(`/bot-flows/${id}`),
  create: (data: object) => api.post('/bot-flows', data),
  generate: (data: object) => api.post('/bot-flows/generate', data),
  preset: (preset: string) => api.post('/bot-flows/preset', { preset }),
  update: (id: string, data: object) => api.put(`/bot-flows/${id}`, data),
  delete: (id: string) => api.delete(`/bot-flows/${id}`),
};

export const keywordApi = {
  getKeywords: () => api.get('/keywords'),
  getKeyword: (id: string) => api.get(`/keywords/${id}`),
  createKeyword: (data: object) => api.post('/keywords', data),
  updateKeyword: (id: string, data: object) => api.put(`/keywords/${id}`, data),
  deleteKeyword: (id: string) => api.delete(`/keywords/${id}`),
};

// Events
export const eventApi = {
  getEvents: () => api.get('/events'),
  getEvent: (id: string) => api.get(`/events/${id}`),
  createEvent: (data: object) => api.post('/events', data),
  updateEvent: (id: string, data: object) => api.put(`/events/${id}`, data),
  deleteEvent: (id: string) => api.delete(`/events/${id}`),
};

// AI Calling
export const aiCallingApi = {
  getAgents: () => api.get('/ai-calling'),
  getAgent: (id: string) => api.get('/ai-calling/' + id),
  createAgent: (data: object) => api.post('/ai-calling', data),
  updateAgent: (id: string, data: object) => api.put('/ai-calling/' + id, data),
  deleteAgent: (id: string) => api.delete('/ai-calling/' + id),
  initiateCall: (data: object) => api.post('/ai-calling/call', data),
  getCallStatus: (callId: string) => api.get('/ai-calling/call/' + callId),
  terminateCall: (callId: string) => api.post('/ai-calling/call/' + callId + '/terminate'),
  requestPermission: (contactPhone: string) => api.post('/ai-calling/request-permission', { contactPhone }),
  getIncoming: () => api.get('/ai-calling/incoming'),
  acceptCall: (callId: string, sdp: string) => api.post('/ai-calling/call/' + callId + '/accept', { sdp }),
  rejectCall: (callId: string) => api.post('/ai-calling/call/' + callId + '/reject'),
  getCallLogs: () => api.get('/ai-calling/logs'),
  getCallHistory: () => api.get('/ai-calling/history'),
  uploadRecording: (callId: string, blob: Blob) => {
    const fd = new FormData();
    fd.append('file', blob, 'recording.webm');
    return api.post('/ai-calling/call/' + callId + '/recording', fd);
  },
  setDefaultAgent: (data: object) => api.post('/ai-calling/default-agent', data),
  getCallCampaigns: () => api.get('/ai-calling/campaigns'),
  getCallCampaign: (id: string) => api.get('/ai-calling/campaigns/' + id),
  createCallCampaign: (data: object) => api.post('/ai-calling/campaigns', data),
  startCallCampaign: (id: string) => api.post('/ai-calling/campaigns/' + id + '/start'),
  pauseCallCampaign: (id: string) => api.post('/ai-calling/campaigns/' + id + '/pause'),
  deleteCallCampaign: (id: string) => api.delete('/ai-calling/campaigns/' + id),
};

// Drip Campaigns
export const dripApi = {
  list: () => api.get('/drips'),
  get: (id: string) => api.get(`/drips/${id}`),
  create: (data: object) => api.post('/drips', data),
  update: (id: string, data: object) => api.put(`/drips/${id}`, data),
  delete: (id: string) => api.delete(`/drips/${id}`),
  start: (id: string) => api.post(`/drips/${id}/start`),
  pause: (id: string) => api.post(`/drips/${id}/pause`),
};

// Admin APIs
export const adminApi = {
  // Dashboard
  getDashboard: () => api.get('/admin/dashboard'),
  // Users
  getUsers: (params?: Record<string, unknown>) => api.get('/admin/users', { params }),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  createUser: (data: object) => api.post('/admin/users', data),
  updateUser: (id: string, data: object) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  // Plans
  getPlans: () => api.get('/admin/plans'),
  createPlan: (data: object) => api.post('/admin/plans', data),
  updatePlan: (id: string, data: object) => api.put(`/admin/plans/${id}`, data),
  deletePlan: (id: string) => api.delete(`/admin/plans/${id}`),
  // Payments
  getPayments: (params?: Record<string, unknown>) => api.get('/admin/payments', { params }),
  getPaymentInvoice: (id: string) => api.get(`/admin/payments/${id}/invoice`, { responseType: 'blob' }),
  emailPaymentInvoices: (ids: string[]) => api.post('/admin/payments/email-invoices', { ids }),
  approvePayment: (id: string) => api.post(`/admin/payments/${id}/approve`, {}),
  rejectPayment: (id: string, reason?: string) => api.post(`/admin/payments/${id}/reject`, { reason }),
  // Wallet
  getWalletLedger: (params?: Record<string, unknown>) => api.get('/admin/wallet/ledger', { params }),
  adjustWallet: (data: object) => api.post('/admin/wallet/adjust', data),
  // Meta Pricing
  getMetaPricing: () => api.get('/admin/meta-pricing'),
  updateMetaPricing: (data: object) => api.post('/admin/meta-pricing', data),
  // Permissions
  getPermissions: () => api.get('/admin/permissions'),
  updatePermissions: (data: object) => api.put('/admin/permissions', data),
  // Settings
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data: object) => api.put('/admin/settings', data),
  sendTestEmail: (data: object) => api.post('/admin/settings/test-email', data),
  // Gateways
  getGateways: () => api.get('/admin/gateways'),
  updateGateway: (id: string, data: object) => api.put(`/admin/gateways/${id}`, data),
  testGateway: (id: string, data: object) => api.post(`/admin/gateways/${id}/test`, data),
  // Landing Page
  getLandingPage: () => api.get('/admin/landing-page'),
  updateLandingPage: (data: object) => api.put('/admin/landing-page', data),
  // Templates
  getTemplates: () => api.get('/admin/templates'),
  createTemplate: (data: object) => api.post('/admin/templates', data),
  updateTemplate: (id: string, data: object) => api.put(`/admin/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/admin/templates/${id}`),
  // Inquiries
  getInquiries: () => api.get('/admin/inquiries'),
  updateInquiry: (id: string, data: object) => api.put(`/admin/inquiries/${id}`, data),
  replyInquiry: (id: string, data: object) => api.post(`/admin/inquiries/${id}/reply`, data),
  deleteInquiry: (id: string) => api.delete(`/admin/inquiries/${id}`),
  // Quick Replies
  getQuickReplies: () => api.get('/admin/quick-replies'),
  createQuickReply: (data: object) => api.post('/admin/quick-replies', data),
  updateQuickReply: (id: string, data: object) => api.put(`/admin/quick-replies/${id}`, data),
  deleteQuickReply: (id: string) => api.delete(`/admin/quick-replies/${id}`),
  // Languages
  getLanguages: () => api.get('/admin/languages'),
  createLanguage: (data: object) => api.post('/admin/languages', data),
  updateLanguage: (id: string, data: object) => api.put(`/admin/languages/${id}`, data),
  seedLanguages: () => api.post('/admin/languages/seed', {}),
  deleteLanguage: (id: string) => api.delete(`/admin/languages/${id}`),
  // Currencies
  getCurrencies: () => api.get('/admin/currencies'),
  createCurrency: (data: object) => api.post('/admin/currencies', data),
  updateCurrency: (id: string, data: object) => api.put(`/admin/currencies/${id}`, data),
  seedCurrencies: () => api.post('/admin/currencies/seed', {}),
  deleteCurrency: (id: string) => api.delete(`/admin/currencies/${id}`),
  // Taxes
  getTaxes: () => api.get('/admin/taxes'),
  createTax: (data: object) => api.post('/admin/taxes', data),
  deleteTax: (id: string) => api.delete(`/admin/taxes/${id}`),
  // FAQ
  getFAQs: () => api.get('/admin/faqs'),
  createFAQ: (data: object) => api.post('/admin/faqs', data),
  updateFAQ: (id: string, data: object) => api.put(`/admin/faqs/${id}`, data),
  deleteFAQ: (id: string) => api.delete(`/admin/faqs/${id}`),
  // Testimonials
  getTestimonials: () => api.get('/admin/testimonials'),
  createTestimonial: (data: object) => api.post('/admin/testimonials', data),
  updateTestimonial: (id: string, data: object) => api.put(`/admin/testimonials/${id}`, data),
  deleteTestimonial: (id: string) => api.delete(`/admin/testimonials/${id}`),
  // Pages
  getPages: () => api.get('/admin/pages'),
  createPage: (data: object) => api.post('/admin/pages', data),
  updatePage: (id: string, data: object) => api.put(`/admin/pages/${id}`, data),
  deletePage: (id: string) => api.delete(`/admin/pages/${id}`),
  // Short Links
  getShortLinks: () => api.get('/admin/short-links'),
  deleteShortLink: (id: string) => api.delete(`/admin/short-links/${id}`),
  // Integrations
  // AI Settings
  getAISettings: () => api.get('/admin/ai-settings'),
  updateAISettings: (data: unknown) => api.put('/admin/ai-settings', data),
  // Vendors
  getVendors: (params?: Record<string, unknown>) => api.get('/admin/vendors', { params }),
  getVendor: (id: string) => api.get(`/admin/vendors/${id}`),
  createVendor: (data: object) => api.post('/admin/vendors', data),
  updateVendor: (id: string, data: object) => api.put(`/admin/vendors/${id}`, data),
  deleteVendor: (id: string) => api.delete(`/admin/vendors/${id}`),
  loginAsVendor: (id: string) => api.post(`/admin/vendors/${id}/login-as`),
  getVendorDetail: (id: string) => api.get(`/admin/vendors/${id}/detail`),
  // Subscriptions
  getSubscriptions: (params?: Record<string, unknown>) => api.get('/admin/subscriptions', { params }),
  createSubscription: (data: object) => api.post('/admin/subscriptions', data),
  updateSubscription: (id: string, data: object) => api.put(`/admin/subscriptions/${id}`, data),
  getFeatureControls: () => api.get('/admin/feature-controls'),
  updateFeatureControls: (vendorId: string, features: Record<string, boolean>) => api.put(`/admin/feature-controls/${vendorId}`, { features }),
  getVendorAiAssignments: () => api.get('/admin/vendor-ai'),
  updateVendorAiAssignment: (vendorId: string, data: object) => api.put(`/admin/vendor-ai/${vendorId}`, data),
  pushKnowledge: (data: { vendorIds: string[]; articles: { title: string; content: string; category?: string }[] }) => api.post('/admin/push-knowledge', data),
  getDataCleanup: (workspace?: string) => api.get('/admin/data-cleanup', { params: workspace ? { workspace } : undefined }),
  updateDataCleanup: (data: object) => api.put('/admin/data-cleanup', data),
  runDataCleanup: (workspace?: string) => api.post('/admin/data-cleanup/run', workspace ? { workspace } : {}),
  deleteSubscription: (id: string) => api.delete(`/admin/subscriptions/${id}`),
  // Invoices
  getInvoices: (params?: Record<string, unknown>) => api.get('/admin/invoices', { params }),
  createInvoice: (data: object) => api.post('/admin/invoices', data),
  updateInvoice: (id: string, data: object) => api.put(`/admin/invoices/${id}`, data),
  deleteInvoice: (id: string) => api.delete(`/admin/invoices/${id}`),
  getInvoicePdf: (id: string) => api.get(`/admin/invoices/${id}/pdf`, { responseType: 'text' }),
  // Blog
  getBlogPosts: (params?: Record<string, unknown>) => api.get('/admin/blog', { params }),
  createBlogPost: (data: object) => api.post('/admin/blog', data),
  updateBlogPost: (id: string, data: object) => api.put(`/admin/blog/${id}`, data),
  deleteBlogPost: (id: string) => api.delete(`/admin/blog/${id}`),
  // Plan Reminders
  checkExpiringPlans: (params?: Record<string, unknown>) => api.get('/admin/plan-reminders', { params }),
  sendPlanReminder: (data: object) => api.post("/admin/plan-reminders/send", data),
  getAutoReminderSettings: () => api.get("/admin/plan-reminders/auto-settings"),
  updateAutoReminderSettings: (data: object) => api.put("/admin/plan-reminders/auto-settings", data),
  runAutoReminder: () => api.post("/admin/plan-reminders/run-auto"),
};

// Data Fields
export const dataFieldApi = {
  list: () => api.get("/data-fields"),
  create: (data: object) => api.post("/data-fields", data),
  update: (id: string, data: object) => api.put(`/data-fields/${id}`, data),
  delete: (id: string) => api.delete(`/data-fields/${id}`),
};

// Quick Replies (Client)
export const quickReplyClientApi = {
  list: () => api.get("/quick-replies-client"),
  create: (data: object) => api.post("/quick-replies-client", data),
  update: (id: string, data: object) => api.put(`/quick-replies-client/${id}`, data),
  delete: (id: string) => api.delete(`/quick-replies-client/${id}`),
};

// Badges
export const badgeApi = {
  list: () => api.get("/badges"),
  create: (data: object) => api.post("/badges", data),
  update: (id: string, data: object) => api.put(`/badges/${id}`, data),
  delete: (id: string) => api.delete(`/badges/${id}`),
  run: (id: string) => api.post(`/badges/${id}/run`),
};

// Generic file upload
export const uploadApi = {
  uploadFile: (formData: FormData) => api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Media Library
export const mediaApi = {
  list: (params?: Record<string, unknown>) => api.get("/media", { params }),
  upload: (formData: FormData) => api.post("/media/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  update: (id: string, data: object) => api.put(`/media/${id}`, data),
  delete: (id: string) => api.delete(`/media/${id}`),
};

// CTWA Ads
export const ctwaAdApi = {
  list: () => api.get("/ctwa-ads"),
  create: (data: object) => api.post("/ctwa-ads", data),
  update: (id: string, data: object) => api.put(`/ctwa-ads/${id}`, data),
  delete: (id: string) => api.delete(`/ctwa-ads/${id}`),
};

// Predefined Actions
export const predefinedActionApi = {
  list: () => api.get("/predefined-actions"),
  create: (data: object) => api.post("/predefined-actions", data),
  update: (id: string, data: object) => api.put(`/predefined-actions/${id}`, data),
  delete: (id: string) => api.delete(`/predefined-actions/${id}`),
  run: (id: string, data: object) => api.post(`/predefined-actions/${id}/run`, data),
};

// Response Resources
export const responseResourceApi = {
  list: (params?: Record<string, unknown>) => api.get("/response-resources", { params }),
  create: (data: object) => api.post("/response-resources", data),
  update: (id: string, data: object) => api.put(`/response-resources/${id}`, data),
  delete: (id: string) => api.delete(`/response-resources/${id}`),
  use: (id: string) => api.post(`/response-resources/${id}/use`),
};

// Workspace Knowledge Base
export const workspaceKbApi = {
  list: () => api.get('/workspace-kb'),
  create: (data: object) => api.post('/workspace-kb', data),
  update: (id: string, data: object) => api.put('/workspace-kb/' + id, data),
  delete: (id: string) => api.delete('/workspace-kb/' + id),
};

// Audit Logs
export const auditLogApi = {
  list: (params?: Record<string, unknown>) => api.get('/audit-logs', { params }),
};

// Invoices
export const invoiceApi = {
  list: () => api.get('/invoices'),
  createFromOrder: (orderId: string) => api.post('/invoices/from-order/' + orderId),
  update: (id: string, data: object) => api.put('/invoices/' + id, data),
  downloadPdf: (id: string) => api.get('/invoices/' + id + '/pdf', { responseType: 'blob' }),
  email: (id: string, to?: string) => api.post('/invoices/' + id + '/email', to ? { to } : {}),
  emailBulk: (ids: string[]) => api.post('/invoices/email', { ids }),
  emailSubBulk: (ids: string[]) => api.post('/invoices/sub/email', { ids }),
  delete: (id: string) => api.delete('/invoices/' + id),
};

// Platform (coupons, announcements, support tickets, system admin)
export const platformApi = {
  publicBranding: () => api.get('/public/branding'),
  activeAnnouncements: () => api.get('/platform/announcements/active'),
  validateCoupon: (code: string, amount: number, planId?: string) => api.post('/platform/coupons/validate', { code, amount, planId }),
  // Support tickets (vendor)
  myTickets: () => api.get('/platform/support'),
  createTicket: (data: { subject: string; category?: string; priority?: string; message: string }) => api.post('/platform/support', data),
  replyTicket: (id: string, message: string) => api.post(`/platform/support/${id}/reply`, { message }),
  closeTicket: (id: string) => api.put(`/platform/support/${id}/close`),
  reopenTicket: (id: string) => api.put(`/platform/support/${id}/reopen`),
  // Admin
  adminCoupons: () => api.get('/platform/admin/coupons'),
  adminCreateCoupon: (data: object) => api.post('/platform/admin/coupons', data),
  adminUpdateCoupon: (id: string, data: object) => api.put(`/platform/admin/coupons/${id}`, data),
  adminDeleteCoupon: (id: string) => api.delete(`/platform/admin/coupons/${id}`),
  adminAnnouncements: () => api.get('/platform/admin/announcements'),
  adminCreateAnnouncement: (data: object) => api.post('/platform/admin/announcements', data),
  adminUpdateAnnouncement: (id: string, data: object) => api.put(`/platform/admin/announcements/${id}`, data),
  adminDeleteAnnouncement: (id: string) => api.delete(`/platform/admin/announcements/${id}`),
  adminTickets: (status?: string) => api.get('/platform/admin/support', { params: status ? { status } : {} }),
  adminReplyTicket: (id: string, message: string) => api.post(`/platform/admin/support/${id}/reply`, { message }),
  adminTicketStatus: (id: string, status: string) => api.put(`/platform/admin/support/${id}/status`, { status }),
  adminBackups: () => api.get('/platform/admin/backups'),
  adminRunBackup: () => api.post('/platform/admin/backups'),
  adminDownloadBackup: (name: string) => api.get(`/platform/admin/backups/${name}/download`, { responseType: 'blob' }),
  adminDeleteBackup: (name: string) => api.delete(`/platform/admin/backups/${name}`),
  adminHealth: () => api.get('/platform/admin/health'),
  adminHealthReport: (force?: boolean) => api.get('/platform/admin/health-report', { params: force ? { force: 1 } : {}, timeout: 120000 }),
  adminMaintenance: () => api.get('/platform/admin/maintenance'),
  adminSetMaintenance: (data: { isEnabled: boolean; message?: string }) => api.put('/platform/admin/maintenance', data),
};
