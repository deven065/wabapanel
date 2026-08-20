export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: 'super_admin' | 'admin' | 'user' | 'agent' | 'vendor';
  status: 'active' | 'inactive' | 'suspended';
  currentWorkspace: Workspace | string;
  plan: Plan | string;
  planExpiry: string;
  walletBalance: number;
  permissions: string[];
  lastLogin: string;
  createdAt: string;
}

export interface Workspace {
  _id: string;
  name: string;
  owner: string;
  members: WorkspaceMember[];
  whatsapp: WhatsAppConfig;
  settings: WorkspaceSettings;
  walletBalance: number;
  plan: Plan | string;
  timezone: string;
  apiKey: string;
  webhookUrl: string;
  createdAt: string;
}

export interface WorkspaceMember {
  user: string | User;
  role: 'owner' | 'admin' | 'member' | 'agent';
  joinedAt: string;
}

export interface WhatsAppConfig {
  extraNumbers?: { phoneNumberId: string; phoneNumber: string; displayName: string }[];
  isConnected: boolean;
  connectionMethod: '' | 'embedded' | 'qr' | 'manual';
  wabaId: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  phoneNumber: string;
  displayName: string;
  qualityRating: string;
  webhookSecret: string;
}

export interface WorkspaceSettings {
  timezone: string;
  defaultLanguage: string;
  currency: string;
  autoAssign: boolean;
  businessHours: { enabled: boolean; schedule: Record<string, unknown> };
}

export interface Plan {
  _id: string;
  name: string;
  description: string;
  price: number;
  quarterlyPrice?: number;
  yearlyPrice?: number;
  interval: 'monthly' | 'quarterly' | 'yearly' | 'lifetime' | 'free_trial';
  limits: PlanLimits;
  features: PlanFeatures;
  isPopular: boolean;
  status: 'active' | 'inactive';
}

export interface PlanLimits {
  contacts: number;
  templateBots: number;
  messageBots: number;
  campaigns: number;
  aiPrompts: number;
  agents: number;
  conversations: number;
  teams: number;
  botFlows: number;
  customFields: number;
  tags: number;
  whatsappForms: number;
  aiCallingAgents: number;
  appointmentBookings: number;
  facebookAdsCampaigns: number;
  kanbanFunnels: number;
  segments: number;
}

export interface PlanFeatures {
  restApi: boolean;
  whatsappWebhook: boolean;
  autoReplies: boolean;
  analytics: boolean;
  prioritySupport: boolean;
}

export interface Contact {
  _id: string;
  workspace: string;
  name: string;
  phone: string;
  profileName?: string;
  avatar?: string;
  email: string;
  tags: Tag[];
  badges?: Tag[];
  segments: string[];
  customFields: Record<string, unknown>;
  source: string;
  channel?: string;
  status: 'active' | 'inactive' | 'blocked' | 'opted_out';
  optInStatus?: boolean;
  lastMessageAt: string;
  createdAt: string;
  pipelineStage?: { pipeline: string; stage: string; status?: string } | null;
}

export interface Tag {
  _id: string;
  workspace: string;
  name: string;
  color: string;
  contactCount: number;
}

export interface Segment {
  _id: string;
  workspace: string;
  name: string;
  description: string;
  rules: SegmentRule[];
  contactCount: number;
}

export interface SegmentRule {
  field: string;
  operator: string;
  value: string;
}

export interface Template {
  _id: string;
  workspace: string;
  name: string;
  body: string;
  header?: { type: string; content: string; mediaUrl?: string };
  footer?: string;
  buttons?: { type: string; text: string; value?: string }[];
  category: string;
  waCategory: string;
  language: string;
  status: 'pending' | 'approved' | 'rejected';
  components?: TemplateComponent[];
  metaTemplateId?: string;
  whatsappTemplateId?: string;
  variables?: string[];
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  buttons?: TemplateButton[];
}

export interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface Campaign {
  _id: string;
  workspace: string;
  name: string;
  type: 'broadcast' | 'drip';
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused' | 'failed';
  template: Template | string;
  audience: { type: string; segments: string[]; tags: string[]; contacts: string[] };
  schedule: { sendAt: string; timezone: string };
  stats: { total: number; sent: number; delivered: number; read: number; failed: number };
  createdAt: string;
}

export interface Conversation {
  _id: string;
  workspace: string;
  contact: Contact | string;
  assignedTo: User | string;
  assignedAgent?: { _id: string; name: string; email?: string } | string;
  aiEnabled?: boolean;
  aiDisabled?: boolean;
  aiCallEnabled?: boolean;
  status: 'active' | 'resolved' | 'pending' | 'expired' | 'closed';
  lastMessage: Message;
  unreadCount: number;
  tags: string[];
  updatedAt: string;
  pinnedAt?: string;
}

export interface Message {
  _id: string;
  workspace: string;
  conversation: string;
  contact: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | 'sticker' | 'template' | 'interactive' | 'reaction';
  text: string;
  media?: { url: string; mimeType: string; caption: string; filename: string };
  template?: { name: string; language: string; components: unknown[] };
  interactive?: Record<string, unknown>;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  sentBy: string;
  whatsappMessageId: string;
  waMessageId?: string;
  context?: { messageId?: string; text?: string; from?: string };
  reactions?: { emoji: string; from: string }[];
  createdAt: string;
}

export interface Automation {
  _id: string;
  workspace: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  triggerType: 'keyword' | 'event' | 'schedule' | 'webhook';
  triggerConfig: Record<string, unknown>;
  nodes: FlowNode[];
  edges: FlowEdge[];
  stats: { triggered: number; completed: number; failed: number };
  createdAt: string;
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: string;
}

export interface Pipeline {
  _id: string;
  workspace: string;
  name: string;
  stages: PipelineStage[];
}

export interface PipelineStage {
  _id: string;
  name: string;
  color: string;
  order: number;
  deals: Deal[];
}

export interface Deal {
  _id: string;
  title: string;
  value: number;
  contact: Contact | string;
  contactName?: string;
  contactPhone?: string;
  stage: string;
  assignedTo: User | string;
  notes: string;
}

export interface Form {
  _id: string;
  workspace: string;
  name: string;
  slug: string;
  fields: FormField[];
  status: 'active' | 'inactive';
  submissions: number;
}

export interface FormField {
  label: string;
  type: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface ShortLink {
  _id: string;
  workspace: string;
  name: string;
  title: string;
  originalUrl: string;
  shortCode: string;
  shortUrl: string;
  slug: string;
  clicks: number;
  isActive: boolean;
  status: 'active' | 'inactive';
}

export interface Appointment {
  _id: string;
  workspace: string;
  title: string;
  contact: Contact | string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  scheduledAt: string;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'pending' | 'confirmed';
  notes: string;
}

export interface Team {
  _id: string;
  workspace: string;
  name: string;
  description: string;
  members: string[];
  lead: string;
}

export interface Payment {
  _id: string;
  user: User | string;
  plan: Plan | string;
  amount: number;
  currency: string;
  gateway: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  transactionId: string;
  createdAt: string;
}

export interface WalletTransaction {
  _id: string;
  user: User | string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  balanceAfter: number;
  createdAt: string;
}

export interface QuickReply {
  _id: string;
  title: string;
  message: string;
  shortcut: string;
}

export interface Inquiry {
  _id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'in_progress' | 'resolved';
  createdAt: string;
}

export interface SystemSettings {
  _id: string;
  appName: string;
  appEmail: string;
  appDescription: string;
  logo: string;
  favicon: string;
  theme: string;
  whatsapp: { apiUrl: string; appId: string; appSecret: string };
  email: { host: string; port: number; user: string; pass: string; from: string };
  ai: { providers: AIProvider[]; defaultProvider: string };
  maintenance: { enabled: boolean; message: string };
}

export interface AIProvider {
  name: string;
  displayName: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  isActive: boolean;
}

export interface LandingPage {
  _id: string;
  hero: { title: string; subtitle: string; description: string; ctaText: string; ctaLink: string; image: string };
  features: { icon: string; title: string; description: string; order: number }[];
  faq: { question: string; answer: string; order: number }[];
  testimonials: { name: string; role: string; content: string; avatar: string }[];
  footer: { companyName: string; description: string; links: { label: string; url: string }[] };
  isPublished: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
