'use client';
import React, { useState, useEffect } from 'react';
import { Palette, Save, Copy, Eye, ToggleLeft, ToggleRight, Code, MessageSquare, RefreshCw } from 'lucide-react';
import { chatAppearanceApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface ChatAppearanceSettings {
  enabled: boolean;
  widgetColor: string;
  position: string;
  welcomeMessage: string;
  headerTitle: string;
  headerSubtitle: string;
  avatarUrl: string;
  buttonText: string;
  buttonIcon: string;
  showOnMobile: boolean;
  autoOpen: boolean;
  autoOpenDelay: number;
}

const defaultSettings: ChatAppearanceSettings = {
  enabled: false, widgetColor: '#25D366', position: 'bottom-right',
  welcomeMessage: 'Hi! How can we help you today?', headerTitle: 'Chat with us',
  headerSubtitle: 'We typically reply within minutes', avatarUrl: '',
  buttonText: '', buttonIcon: 'whatsapp', showOnMobile: true, autoOpen: false, autoOpenDelay: 5,
};

export default function ChatAppearancePage() {
  const [settings, setSettings] = useState<ChatAppearanceSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [embedCode, setEmbedCode] = useState('');
  const [showEmbed, setShowEmbed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    chatAppearanceApi.get()
      .then(r => { if (r.data.data) setSettings({ ...defaultSettings, ...r.data.data }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);

    setSaving(true);
    try {
      await chatAppearanceApi.update(settings);
      toast.success('Widget settings saved!');
    } catch { toast.error('Failed to save'); } finally { setSubmitting(false); }
    setSaving(false);
  };

  const handleGetEmbed = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await chatAppearanceApi.getEmbedCode();
      setEmbedCode(r.data.data?.embedCode || '');
      setShowEmbed(true);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Enable widget first');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Palette className="w-6 h-6 text-emerald-600" /> Chat Widget</h1>
          <p className="text-sm text-gray-500 mt-1">Customize the WhatsApp chat widget for your website</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${settings.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {settings.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {settings.enabled ? 'Widget ON' : 'Widget OFF'}
          </button>
          <button onClick={handleGetEmbed} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm hover:bg-blue-100">
            <Code className="w-4 h-4" /> Get Embed Code
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h3 className="font-semibold text-gray-900">Widget Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Widget Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={settings.widgetColor} onChange={e => setSettings({ ...settings, widgetColor: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
                <input type="text" value={settings.widgetColor} onChange={e => setSettings({ ...settings, widgetColor: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
              <select value={settings.position} onChange={e => setSettings({ ...settings, position: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Header Title</label>
            <input type="text" value={settings.headerTitle} onChange={e => setSettings({ ...settings, headerTitle: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Header Subtitle</label>
            <input type="text" value={settings.headerSubtitle} onChange={e => setSettings({ ...settings, headerSubtitle: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Welcome Message</label>
            <textarea value={settings.welcomeMessage} onChange={e => setSettings({ ...settings, welcomeMessage: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm h-20 resize-y" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Button Text (optional)</label>
            <input type="text" value={settings.buttonText} onChange={e => setSettings({ ...settings, buttonText: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Chat with us" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Button Icon</label>
              <select value={settings.buttonIcon} onChange={e => setSettings({ ...settings, buttonIcon: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="whatsapp">WhatsApp</option>
                <option value="chat">Chat Bubble</option>
                <option value="message">Message</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auto-open Delay (sec)</label>
              <input type="number" value={settings.autoOpenDelay} onChange={e => setSettings({ ...settings, autoOpenDelay: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" min="1" max="60" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={settings.showOnMobile} onChange={e => setSettings({ ...settings, showOnMobile: e.target.checked })} className="w-4 h-4 text-emerald-600 rounded" />
              <span className="text-sm text-gray-700">Show on mobile devices</span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={settings.autoOpen} onChange={e => setSettings({ ...settings, autoOpen: e.target.checked })} className="w-4 h-4 text-emerald-600 rounded" />
              <span className="text-sm text-gray-700">Auto-open widget after delay</span>
            </label>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-100 rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Eye className="w-4 h-4" /> Live Preview</h3>
          <div className="relative bg-white rounded-xl h-[500px] overflow-hidden shadow-sm border">
            <div className="p-6 text-center text-gray-300 text-sm">Your website content here</div>
            {/* Widget Preview */}
            <div className={`absolute bottom-4 ${settings.position === 'bottom-right' ? 'right-4' : 'left-4'}`}>
              <div className="mb-3 w-72 bg-white rounded-2xl shadow-2xl border overflow-hidden">
                <div className="p-4 text-white" style={{ backgroundColor: settings.widgetColor }}>
                  <h4 className="font-semibold text-sm">{settings.headerTitle}</h4>
                  <p className="text-xs opacity-80">{settings.headerSubtitle}</p>
                </div>
                <div className="p-4">
                  <div className="bg-gray-100 rounded-xl p-3 text-sm text-gray-700">{settings.welcomeMessage}</div>
                  <div className="mt-3 flex gap-2">
                    <input type="text" placeholder="Type a message..." className="flex-1 px-3 py-2 border rounded-full text-xs" disabled />
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: settings.widgetColor }}>
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <button className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white" style={{ backgroundColor: settings.widgetColor }}>
                <MessageSquare className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Embed Code Modal */}
      {showEmbed && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowEmbed(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Embed Code</h3>
              <button onClick={() => setShowEmbed(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-500 mb-3">Copy this code and paste it before the closing <code className="bg-gray-100 px-1 rounded">&lt;/body&gt;</code> tag of your website.</p>
              <div className="bg-gray-900 rounded-lg p-4 relative">
                <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap">{embedCode}</pre>
                <button onClick={() => { navigator.clipboard.writeText(embedCode); toast.success('Embed code copied!'); }}
                  className="absolute top-2 right-2 p-2 bg-gray-700 rounded-lg hover:bg-gray-600">
                  <Copy className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
