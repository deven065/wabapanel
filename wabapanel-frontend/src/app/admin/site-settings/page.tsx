/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useEffect } from 'react';
import { Globe, Save, Link2, Mail, Palette, FileText, Plus, Trash2, Eye, BarChart3, Sparkles, MessageSquare } from 'lucide-react';
import ImageUploadInput from '@/components/ui/ImageUploadInput';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const PRESET_COLORS = ['#059669','#2563eb','#7c3aed','#db2777','#ea580c','#0f766e','#166534','#111827','#dc2626','#f59e0b'];
const FONTS = [{l:'Inter (default)',v:'Inter'},{l:'Poppins',v:'Poppins'},{l:'Roboto',v:'Roboto'},{l:'Montserrat',v:'Montserrat'},{l:'Nunito',v:'Nunito'},{l:'Lato',v:'Lato'},{l:'Open Sans',v:'Open Sans'}];

interface TabProps { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; }
const Tab = ({ active, onClick, icon, label }: TabProps) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active ? 'bg-violet-50 text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
    {icon}{label}
  </button>
);
const Field = ({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) => (
  <div><label className="text-sm font-medium text-gray-700">{label}</label>{desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}<div className="mt-1">{children}</div></div>
);
const ic = "w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none transition-all";
const tc = ic + " resize-none";
const bc = "flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 transition-all";

const prettyLabel = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

function ContentEditor({ value, onChange, path = '' }: { value: any; onChange: (v: any) => void; path?: string }) {
  if (typeof value === 'string') {
    const isImg = /image|photo|logo|icon$/i.test(path.split('.').pop() || '');
    if (value.length > 80 || /desc|content|subtitle|answer|intro/i.test(path)) {
      return <textarea rows={Math.min(6, Math.max(2, Math.ceil(value.length / 90)))} value={value} onChange={e => onChange(e.target.value)} className={tc} />;
    }
    return isImg
      ? <ImageUploadInput label="" value={value} onChange={onChange} folder="content" />
      : <input type="text" value={value} onChange={e => onChange(e.target.value)} className={ic} autoComplete="off" />;
  }
  if (Array.isArray(value)) {
    return (
      <div className="space-y-3">
        {value.map((item, i) => (
          <div key={i} className="p-3 border border-gray-200 rounded-xl bg-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Item {i + 1}</span>
              <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
            </div>
            <ContentEditor value={item} onChange={v => { const n = [...value]; n[i] = v; onChange(n); }} path={path} />
          </div>
        ))}
        <button onClick={() => {
          const tpl = value.length ? JSON.parse(JSON.stringify(value[value.length - 1])) : '';
          const blank = (x: any): any => typeof x === 'string' ? '' : Array.isArray(x) ? [] : typeof x === 'object' && x ? Object.fromEntries(Object.keys(x).map(k => [k, blank(x[k])])) : x;
          onChange([...value, blank(tpl)]);
        }} className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-violet-300 text-violet-600 rounded-lg text-xs font-medium hover:bg-violet-50"><Plus className="w-3 h-3" /> Add Item</button>
      </div>
    );
  }
  if (value && typeof value === 'object') {
    return (
      <div className="space-y-4">
        {Object.keys(value).map(k => (
          <div key={k}>
            <label className="text-sm font-medium text-gray-700">{prettyLabel(k)}</label>
            <div className="mt-1"><ContentEditor value={value[k]} onChange={v => onChange({ ...value, [k]: v })} path={path ? path + '.' + k : k} /></div>
          </div>
        ))}
      </div>
    );
  }
  return <input type="text" value={String(value ?? '')} onChange={e => onChange(e.target.value)} className={ic} autoComplete="off" />;
}

const CONTENT_SECTIONS: { key: string; label: string }[] = [
  { key: 'nav', label: 'Navbar' },
  { key: 'home', label: 'Homepage' },
  { key: 'footer', label: 'Footer Texts' },
  { key: 'about', label: 'About Page' },
  { key: 'team', label: 'Team Page' },
  { key: 'contact', label: 'Contact Page' },
  { key: 'featuresPage', label: 'Features Page' },
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'terms', label: 'Terms of Service' },
];

export default function SiteSettingsPage() {
  const [tab, setTab] = useState('content');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [settings, setSettings] = useState<any>({});
  const [landing, setLanding] = useState<any>({});
  const [pages, setPages] = useState<any[]>([]);
  const [content, setContent] = useState<any>(null);
  const [contentSection, setContentSection] = useState('home');
  const [codeMode, setCodeMode] = useState(false);
  const [codeText, setCodeText] = useState('');
  const [themes, setThemes] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API}/public/site-themes`).then(r => r.json()).then(d => { if (d.success) setThemes(d.data || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers: any = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API}/admin/settings?t=${Date.now()}`, { headers, cache: 'no-store' }).then(r => r.json()),
      fetch(`${API}/admin/landing-page?t=${Date.now()}`, { headers, cache: 'no-store' }).then(r => r.json()),
      fetch(`${API}/admin/pages?t=${Date.now()}`, { headers, cache: 'no-store' }).then(r => r.json()),
      fetch(`${API}/admin/site-content?t=${Date.now()}`, { headers, cache: 'no-store' }).then(r => r.json()),
    ]).then(([sRes, lRes, pRes, cRes]) => {
      if (cRes.success && cRes.data) setContent(cRes.data);
      if (sRes.success && sRes.data) {
        // Flatten the section-based response into a flat settings object
        const d = sRes.data;
        setSettings({
          appName: d.general?.appName || '',
          appEmail: d.general?.appEmail || '',
          appDescription: d.general?.appDescription || '',
          appUrl: d.general?.appUrl || '',
          tagline: d.branding?.tagline || '',
          logo: d.branding?.logo || '',
          logoDark: d.branding?.logoDark || '',
          favicon: d.branding?.favicon || '',
          loginBg: d.branding?.loginBg || '',
          emailHost: d.email?.host || '',
          emailPort: String(d.email?.port || '587'),
          emailUser: d.email?.user || '',
          emailPassword: '',
          emailFrom: d.email?.from || '',
          emailFromName: d.email?.fromName || '',
          emailEncryption: d.email?.encryption || 'tls',
          primaryColor: d.general?.primaryColor || '#059669',
          primaryFont: d.general?.primaryFont || 'Inter',
          siteTheme: d.general?.siteTheme || 'royal-violet',
          wwEnabled: d.whatsappWidget?.enabled || false,
          wwPhone: d.whatsappWidget?.phone || '',
          wwMessage: d.whatsappWidget?.message || '',
          wwGreeting: d.whatsappWidget?.greeting || '',
        });
      }
      if (lRes.success) setLanding(lRes.data || {});
      if (pRes.success) setPages(pRes.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const saveSettings = async (section: string, data: any) => {
    setSaving(true); setMsg('');
    const token = localStorage.getItem('token');
    const headers: any = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      const r = await fetch(`${API}/admin/settings`, { method: 'PUT', headers, body: JSON.stringify({ section, data }) });
      const d = await r.json();
      if (r.ok && d.success !== false) setMsg('Saved successfully!');
      else setMsg(d.message || `Save failed (${r.status}) — your account does not have permission`);
      setTimeout(() => setMsg(''), 5000);
    } catch { setMsg('Error saving'); }
    setSaving(false);
  };

  const saveLanding = async () => {
    setSaving(true); setMsg('');
    const token = localStorage.getItem('token');
    const headers: any = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      const method = landing._id ? 'PUT' : 'POST';
      const r = await fetch(`${API}/admin/landing-page`, { method, headers, body: JSON.stringify(landing) });
      const d = await r.json();
      if (r.ok && d.success !== false) setMsg('Saved successfully!');
      else setMsg(d.message || `Save failed (${r.status}) — your account does not have permission`);
      setTimeout(() => setMsg(''), 5000);
    } catch { setMsg('Error saving'); }
    setSaving(false);
  };

  const savePage = async (pg: any) => {
    const token = localStorage.getItem('token');
    const headers: any = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (pg._id) { await fetch(`${API}/admin/pages/${pg._id}`, { method: 'PUT', headers, body: JSON.stringify(pg) }); }
    else { const r = await fetch(`${API}/admin/pages`, { method: 'POST', headers, body: JSON.stringify(pg) }); const d = await r.json(); if (d.success) setPages(prev => prev.map(p => p === pg ? d.data : p)); }
    setMsg('Page saved!'); setTimeout(() => setMsg(''), 3000);
  };
  const deletePage = async (pg: any) => {
    if (!pg._id || !confirm('Delete this page?')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/admin/pages/${pg._id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setPages(prev => prev.filter(p => p._id !== pg._id));
  };

  const saveContent = async (data?: any) => {
    setSaving(true); setMsg('');
    const token = localStorage.getItem('token');
    const headers: any = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      const r = await fetch(`${API}/admin/site-content`, { method: 'PUT', headers, body: JSON.stringify({ content: data || content }) });
      const d = await r.json();
      if (r.ok && d.success) { setContent(d.data); setMsg('Saved! Website updated instantly.'); }
      else setMsg(d.message || `Save failed (${r.status}) — your account does not have permission`);
      setTimeout(() => setMsg(''), 3000);
    } catch { setMsg('Error saving'); }
    setSaving(false);
  };

  const setS = (key: string, val: any) => setSettings((s: any) => ({ ...s, [key]: val }));
  const setL = (path: string, val: any) => {
    setLanding((l: any) => {
      const parts = path.split('.');
      const obj = { ...l };
      let cur: any = obj;
      for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = { ...(cur[parts[i]] || {}) }; cur = cur[parts[i]]; }
      cur[parts[parts.length - 1]] = val;
      return obj;
    });
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Site Settings</h1>
          <p className="text-sm text-gray-500">Complete website customization — change anything, updates everywhere instantly</p>
        </div>
        <a href="/" target="_blank" className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
          <Eye className="w-4 h-4" /> Preview Site
        </a>
      </div>
      {msg && <div className="mb-4 px-4 py-2 bg-violet-50 border border-violet-200 text-violet-700 rounded-lg text-sm">{msg}</div>}
      <div className="flex flex-wrap gap-1 pb-2 mb-6 border-b border-gray-100">
        <Tab active={tab === 'content'} onClick={() => setTab('content')} icon={<Sparkles className="w-4 h-4" />} label="Website Content" />
        <Tab active={tab === 'business'} onClick={() => setTab('business')} icon={<Globe className="w-4 h-4" />} label="Business Info" />
        <Tab active={tab === 'branding'} onClick={() => setTab('branding')} icon={<Palette className="w-4 h-4" />} label="Branding" />
        <Tab active={tab === 'theme'} onClick={() => setTab('theme')} icon={<Palette className="w-4 h-4" />} label="Theme / Colors" />
        <Tab active={tab === 'smtp'} onClick={() => setTab('smtp')} icon={<Mail className="w-4 h-4" />} label="Email SMTP" />
        <Tab active={tab === 'contact'} onClick={() => setTab('contact')} icon={<Mail className="w-4 h-4" />} label="Contact" />
        <Tab active={tab === 'social'} onClick={() => setTab('social')} icon={<Link2 className="w-4 h-4" />} label="Social Links" />
        <Tab active={tab === 'chatwidget'} onClick={() => setTab('chatwidget')} icon={<MessageSquare className="w-4 h-4" />} label="WhatsApp Widget" />
        <Tab active={tab === 'seo'} onClick={() => setTab('seo')} icon={<BarChart3 className="w-4 h-4" />} label="SEO" />
        <Tab active={tab === 'pages'} onClick={() => setTab('pages')} icon={<FileText className="w-4 h-4" />} label="Pages" />
      </div>

      {tab === 'content' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-800">Website Content — edit everything, word by word</h3>
              <p className="text-sm text-gray-500">All texts of every page are here, pre-filled with what is live. Change anything and Save — it updates on the website instantly. Tip: write {'{business}'} anywhere and it auto-shows your Business Name everywhere.</p>
            </div>
            <button onClick={() => { if (!codeMode) setCodeText(JSON.stringify(content, null, 2)); setCodeMode(!codeMode); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
              {codeMode ? 'Form Mode' : 'Code Mode (JSON)'}
            </button>
          </div>
          {!content && <div className="text-sm text-gray-400">Loading content...</div>}
          {content && codeMode && (
            <div className="space-y-3">
              <textarea rows={28} value={codeText} onChange={e => setCodeText(e.target.value)} className={tc + ' font-mono text-xs'} spellCheck={false} />
              <button onClick={() => { try { const parsed = JSON.parse(codeText); setContent(parsed); saveContent(parsed); setCodeMode(false); } catch { setMsg('Invalid JSON — please fix and try again'); setTimeout(() => setMsg(''), 3000); } }} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save JSON'}</button>
            </div>
          )}
          {content && !codeMode && (
            <div className="flex gap-6">
              <div className="w-44 shrink-0 space-y-1">
                {CONTENT_SECTIONS.map(s => (
                  <button key={s.key} onClick={() => setContentSection(s.key)} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${contentSection === s.key ? 'bg-violet-50 text-violet-700' : 'text-gray-500 hover:bg-gray-50'}`}>{s.label}</button>
                ))}
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                <ContentEditor value={content[contentSection] || {}} onChange={v => setContent({ ...content, [contentSection]: v })} path={contentSection} />
                <button onClick={() => saveContent()} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'business' && (
        <div className="space-y-4 max-w-2xl">
          <h3 className="font-semibold text-gray-800">Business Information</h3>
          <p className="text-sm text-gray-500 -mt-2">This info appears across the entire website. Change once, updates everywhere.</p>
          <Field label="Business Name" desc="Shows in navbar, footer, copyright, emails"><input type="text" value={settings.appName || ''} onChange={e => setS('appName', e.target.value)} className={ic} placeholder="KKHS Media" autoComplete="off" /></Field>
          <Field label="Tagline" desc="Short description below logo"><input type="text" value={settings.tagline || ''} onChange={e => setS('tagline', e.target.value)} className={ic} placeholder="WhatsApp Business Platform" autoComplete="off" /></Field>
          <Field label="Business Email" desc="Shown on contact page and in emails"><input type="email" value={settings.appEmail || ''} onChange={e => setS('appEmail', e.target.value)} className={ic} placeholder="info@yourcompany.com" autoComplete="off" /></Field>
          <Field label="Website URL"><input type="url" value={settings.appUrl || ''} onChange={e => setS('appUrl', e.target.value)} className={ic} placeholder="https://yoursite.com" autoComplete="off" /></Field>
          <Field label="Business Description" desc="Used in about page and SEO"><textarea rows={3} value={settings.appDescription || ''} onChange={e => setS('appDescription', e.target.value)} className={tc} placeholder="About your business..." /></Field>
          <button onClick={() => saveSettings('general', { appName: settings.appName, appEmail: settings.appEmail, appDescription: settings.appDescription, appUrl: settings.appUrl })} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      )}

      {tab === 'branding' && (
        <div className="space-y-4 max-w-2xl">
          <h3 className="font-semibold text-gray-800">Branding & Logo</h3>
          <p className="text-xs text-gray-500 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">This is the single place to manage your logo &amp; branding. It applies everywhere — login page, navbar, footer, and both admin &amp; client sidebars. Any image format is accepted; sizes below are only recommendations.</p>
          <ImageUploadInput label="Logo" value={settings.logo || ''} onChange={v => setS('logo', v)} hint="Recommended: 200×60px, PNG/SVG with transparent background" folder="branding" />
          <ImageUploadInput label="Dark Logo (optional)" value={settings.logoDark || ''} onChange={v => setS('logoDark', v)} hint="Shown on dark backgrounds. Recommended: 200×60px, PNG/SVG" folder="branding" />
          <ImageUploadInput label="Favicon" value={settings.favicon || ''} onChange={v => setS('favicon', v)} hint="Recommended: 32×32px or 64×64px, .ico/.png" folder="branding" />
          <ImageUploadInput label="Login Background" value={settings.loginBg || ''} onChange={v => setS('loginBg', v)} hint="Recommended: 1920×1080px, JPG/PNG" folder="branding" />
          <Field label="Tagline" desc="Shown under the logo — change or leave empty for white label"><input type="text" value={settings.tagline || ''} onChange={e => setS('tagline', e.target.value)} className={ic} autoComplete="off" /></Field>
          <p className="text-xs text-gray-400">To rename the panel, change App Name in Business Info. After uploading a new logo, do a hard refresh (Ctrl+F5) to see it immediately.</p>
          <button onClick={() => saveSettings('branding', { logo: settings.logo, logoDark: settings.logoDark, favicon: settings.favicon, loginBg: settings.loginBg, tagline: settings.tagline })} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Branding'}</button>
        </div>
      )}

      {tab === 'smtp' && (
        <div className="space-y-4 max-w-2xl">
          <h3 className="font-semibold text-gray-800">Email SMTP</h3>
          <p className="text-xs text-gray-500 -mt-2">Outgoing mail server for system emails (signup, invoices, alerts). Email <b>templates</b> remain under System Settings.</p>
          <Field label="SMTP Host"><input type="text" value={settings.emailHost || ''} onChange={e => setS('emailHost', e.target.value)} className={ic} placeholder="smtp.gmail.com" autoComplete="off" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SMTP Port"><input type="text" value={settings.emailPort || ''} onChange={e => setS('emailPort', e.target.value)} className={ic} placeholder="587" autoComplete="off" /></Field>
            <Field label="Encryption">
              <select value={settings.emailEncryption || 'tls'} onChange={e => setS('emailEncryption', e.target.value)} className={ic}>
                <option value="tls">TLS (Port 587)</option>
                <option value="ssl">SSL (Port 465)</option>
                <option value="none">None (Port 25)</option>
              </select>
            </Field>
          </div>
          <Field label="Username"><input type="text" value={settings.emailUser || ''} onChange={e => setS('emailUser', e.target.value)} className={ic} placeholder="your@email.com" autoComplete="off" /></Field>
          <Field label="Password" desc="Leave blank to keep the current password"><input type="password" value={settings.emailPassword || ''} onChange={e => setS('emailPassword', e.target.value)} className={ic} placeholder="App password or SMTP password" autoComplete="new-password" /></Field>
          <Field label="From Email"><input type="text" value={settings.emailFrom || ''} onChange={e => setS('emailFrom', e.target.value)} className={ic} placeholder="noreply@yourdomain.com" autoComplete="off" /></Field>
          <Field label="From Name"><input type="text" value={settings.emailFromName || ''} onChange={e => setS('emailFromName', e.target.value)} className={ic} placeholder="WABA Panel" autoComplete="off" /></Field>
          <button onClick={() => { const d: any = { host: settings.emailHost, port: settings.emailPort, encryption: settings.emailEncryption, user: settings.emailUser, from: settings.emailFrom, fromName: settings.emailFromName }; if (settings.emailPassword) d.password = settings.emailPassword; saveSettings('email', d); }} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save SMTP'}</button>
        </div>
      )}

      {tab === 'chatwidget' && (
        <div className="space-y-4 max-w-2xl">
          <h3 className="font-semibold text-gray-800">WhatsApp Chat Button</h3>
          <p className="text-sm text-gray-500 -mt-2">A floating WhatsApp button in the corner of your public website. Visitors tap it to chat with you on WhatsApp.</p>
          <Field label="Show WhatsApp button on website" desc="Turn the floating button on or off">
            <button type="button" onClick={() => setS('wwEnabled', !settings.wwEnabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.wwEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.wwEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </Field>
          <Field label="WhatsApp Number" desc="With country code, digits only (no + or spaces). Example: 919782005500"><input type="text" value={settings.wwPhone || ''} onChange={e => setS('wwPhone', e.target.value)} className={ic} placeholder="919782005500" autoComplete="off" /></Field>
          <Field label="Pre-filled Message" desc="Text auto-filled in WhatsApp when a visitor opens the chat"><textarea rows={2} value={settings.wwMessage || ''} onChange={e => setS('wwMessage', e.target.value)} className={tc} placeholder="Hi! I have a question about WABA Panel." /></Field>
          <Field label="Button Label (optional)" desc="Small text shown next to the button when hovered"><input type="text" value={settings.wwGreeting || ''} onChange={e => setS('wwGreeting', e.target.value)} className={ic} placeholder="Need help? Chat with us" autoComplete="off" /></Field>
          <button onClick={() => saveSettings('whatsappWidget', { enabled: !!settings.wwEnabled, phone: settings.wwPhone, message: settings.wwMessage, greeting: settings.wwGreeting })} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      )}

      {tab === 'theme' && (
        <div className="space-y-6 max-w-4xl">
          <h3 className="font-semibold text-gray-800">Website Template</h3>
          <p className="text-sm text-gray-500 -mt-4">Choose a template — content stays the same, only the look of the whole website changes. Preview first, then Apply.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {themes.map(t => {
              const active = (settings.siteTheme || 'royal-violet') === t.id;
              return (
                <div key={t.id} className={`p-3 border rounded-xl space-y-2 ${active ? 'border-violet-500 ring-2 ring-violet-200' : 'border-gray-200'}`}>
                  <div className="flex h-8 rounded-lg overflow-hidden">
                    {t.colors.map((c: string, i: number) => <div key={i} className="flex-1" style={{ backgroundColor: c }} />)}
                  </div>
                  <div className="text-sm font-medium text-gray-800">{t.name}{active && <span className="ml-1 text-xs text-violet-600">✓ Active</span>}</div>
                  <div className="text-xs text-gray-400">{t.desc}</div>
                  <div className="flex gap-2">
                    <button onClick={() => window.open('/?previewTheme=' + t.id, '_blank')} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">Preview</button>
                    {!active && <button onClick={() => { setS('siteTheme', t.id); saveSettings('general', { siteTheme: t.id }); }} disabled={saving} className="flex-1 px-2 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700">Apply</button>}
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="font-semibold text-gray-800">Theme / Colors</h3>
          <p className="text-sm text-gray-500 -mt-4">Set the primary color and font for your entire website and admin panel.</p>
          <div className="p-4 border border-gray-200 rounded-xl space-y-4">
            <h4 className="font-medium text-gray-700">Primary Color</h4>
            <p className="text-xs text-gray-400 -mt-2">Used for buttons, links, active states, and accents across the entire site.</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setS('primaryColor', c)} className={"w-8 h-8 rounded-full border-2 transition-all " + (settings.primaryColor === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105')} style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <input type="color" value={settings.primaryColor || '#059669'} onChange={e => setS('primaryColor', e.target.value)} className="w-10 h-10 p-0 border border-gray-200 rounded-lg cursor-pointer" />
              <input type="text" value={settings.primaryColor || '#059669'} onChange={e => setS('primaryColor', e.target.value)} className={ic + ' max-w-[140px]'} placeholder="#059669" autoComplete="off" />
              <span className="text-xs text-gray-400">Pick any custom color to match your logo</span>
            </div>
            {settings.primaryColor && (
              <div className="flex items-center gap-3 mt-2">
                <div className="w-20 h-8 rounded-lg" style={{ backgroundColor: settings.primaryColor }} />
                <span className="text-sm text-gray-500">Preview</span>
              </div>
            )}
          </div>
          <div className="p-4 border border-gray-200 rounded-xl space-y-3">
            <h4 className="font-medium text-gray-700">Font Family</h4>
            <select value={settings.primaryFont || 'Inter'} onChange={e => setS('primaryFont', e.target.value)} className={ic}>
              {FONTS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
          </div>
          <button onClick={() => saveSettings('general', { primaryColor: settings.primaryColor, primaryFont: settings.primaryFont })} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Theme'}</button>
        </div>
      )}

      {tab === 'contact' && (
        <div className="space-y-4 max-w-2xl">
          <h3 className="font-semibold text-gray-800">Contact Information</h3>
          <Field label="Contact Page Title"><input type="text" value={landing.contact?.title || ''} onChange={e => setL('contact.title', e.target.value)} className={ic} autoComplete="off" /></Field>
          <Field label="Contact Email"><input type="email" value={landing.contact?.email || ''} onChange={e => setL('contact.email', e.target.value)} className={ic} autoComplete="off" /></Field>
          <Field label="Contact Phone"><input type="tel" value={landing.contact?.phone || ''} onChange={e => setL('contact.phone', e.target.value)} className={ic} autoComplete="off" /></Field>
          <Field label="Address"><textarea rows={2} value={landing.contact?.address || ''} onChange={e => setL('contact.address', e.target.value)} className={tc} /></Field>
          <button onClick={saveLanding} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      )}

      {tab === 'social' && (
        <div className="space-y-4 max-w-2xl">
          <h3 className="font-semibold text-gray-800">Social Media Links</h3>
          <p className="text-sm text-gray-500 -mt-2">These appear as clickable links in the footer.</p>
          {['facebook','twitter','instagram','linkedin','youtube'].map(s => (
            <Field key={s} label={s.charAt(0).toUpperCase() + s.slice(1)}>
              <input type="url" value={landing.footer?.socialLinks?.[s] || ''} onChange={e => setLanding((l: any) => ({ ...l, footer: { ...l.footer, socialLinks: { ...(l.footer?.socialLinks || {}), [s]: e.target.value } } }))} className={ic} placeholder={`https://${s}.com/yourpage`} autoComplete="off" />
            </Field>
          ))}
          <button onClick={saveLanding} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      )}

      {tab === 'seo' && content && (
        <div className="space-y-4 max-w-2xl">
          <h3 className="font-semibold text-gray-800">SEO, Analytics & Tracking</h3>
          <Field label="Meta Title"><input type="text" value={content.seo?.metaTitle || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, metaTitle: e.target.value } })} className={ic} autoComplete="off" /></Field>
          <Field label="Meta Description"><textarea rows={3} value={content.seo?.metaDescription || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, metaDescription: e.target.value } })} className={tc} /></Field>
          <Field label="Organization Name (schema.org)" desc="Leave blank to auto-use your brand name"><input type="text" value={content.seo?.organizationName || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, organizationName: e.target.value } })} className={ic} autoComplete="off" placeholder="Auto from brand name" /></Field>
          <Field label="Keywords (comma separated)"><input type="text" value={content.seo?.keywords || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, keywords: e.target.value } })} className={ic} autoComplete="off" /></Field>
          <ImageUploadInput label="OG Image" value={content.seo?.ogImage || ''} onChange={v => setContent({ ...content, seo: { ...content.seo, ogImage: v } })} hint="Image shown when shared on social media" folder="branding" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Google Analytics ID" desc="e.g. G-XXXXXXXXXX"><input type="text" value={content.seo?.googleAnalyticsId || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, googleAnalyticsId: e.target.value } })} className={ic} autoComplete="off" /></Field>
            <Field label="Google Tag Manager ID" desc="e.g. GTM-XXXXXXX"><input type="text" value={content.seo?.googleTagManagerId || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, googleTagManagerId: e.target.value } })} className={ic} autoComplete="off" /></Field>
            <Field label="Facebook Pixel ID"><input type="text" value={content.seo?.facebookPixelId || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, facebookPixelId: e.target.value } })} className={ic} autoComplete="off" /></Field>
            <Field label="Google Site Verification" desc="Search Console verification code"><input type="text" value={content.seo?.googleSiteVerification || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, googleSiteVerification: e.target.value } })} className={ic} autoComplete="off" /></Field>
            <Field label="Bing Site Verification"><input type="text" value={content.seo?.bingSiteVerification || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, bingSiteVerification: e.target.value } })} className={ic} autoComplete="off" /></Field>
          </div>
          <Field label="Custom Head Code" desc="Any extra scripts/meta tags (AEO/GEO schema, chat widgets, etc.) — added to every public page"><textarea rows={5} value={content.seo?.customHeadCode || ''} onChange={e => setContent({ ...content, seo: { ...content.seo, customHeadCode: e.target.value } })} className={tc + ' font-mono text-xs'} spellCheck={false} /></Field>
          <button onClick={() => saveContent()} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      )}

      {tab === 'pages' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h3 className="font-semibold text-gray-800">Custom Pages</h3><p className="text-sm text-gray-500">Add additional pages. Access via /pages/your-slug</p></div>
            <button onClick={() => setPages(prev => [...prev, { title: '', slug: '', content: '', status: 'draft' }])} className={bc}><Plus className="w-4 h-4" /> Add Page</button>
          </div>
          {pages.map((pg, i) => (
            <div key={pg._id || i} className="p-4 border border-gray-200 rounded-xl space-y-3 bg-white">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="text" placeholder="Page Title" value={pg.title || ''} onChange={e => { const n = [...pages]; n[i] = { ...n[i], title: e.target.value }; setPages(n); }} className={ic} autoComplete="off" />
                <input type="text" placeholder="slug (e.g. refund-policy)" value={pg.slug || ''} onChange={e => { const n = [...pages]; n[i] = { ...n[i], slug: e.target.value }; setPages(n); }} className={ic} autoComplete="off" />
                <select value={pg.status || 'draft'} onChange={e => { const n = [...pages]; n[i] = { ...n[i], status: e.target.value }; setPages(n); }} className={ic}>
                  <option value="draft">Draft</option><option value="published">Published</option>
                </select>
              </div>
              <textarea rows={4} placeholder="Page content (HTML supported)" value={pg.content || ''} onChange={e => { const n = [...pages]; n[i] = { ...n[i], content: e.target.value }; setPages(n); }} className={tc} />
              <div className="flex gap-2">
                <button onClick={() => savePage(pg)} className="px-3 py-1.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg text-xs font-medium">Save Page</button>
                <button onClick={() => deletePage(pg)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
                {pg.slug && <a href={`/pages/${pg.slug}`} target="_blank" className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium flex items-center gap-1"><Eye className="w-3 h-3" /> View</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
