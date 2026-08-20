'use client';
import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import ImageUploadInput from '@/components/ui/ImageUploadInput';

interface LandingPageData {
  hero: { title: string; subtitle: string; description: string; ctaText: string; ctaLink: string; heroImage: string };
  features: Array<{ icon: string; title: string; description: string }>;
  pricing: { title: string; subtitle: string; showPlans: boolean };
  faq: Array<{ question: string; answer: string }>;
  testimonials: Array<{ name: string; company: string; text: string; avatar: string }>;
  contact: { title: string; email: string; phone: string; address: string };
  footer: { companyName: string; description: string; copyrightText: string; socialLinks: { facebook: string; twitter: string; instagram: string; linkedin: string; youtube: string } };
  seo: { title: string; description: string };
  isPublished: boolean;
}

const defaultData: LandingPageData = {
  hero: { title: 'Transform Your Business Communication', subtitle: 'Powerful WhatsApp Business API Platform', description: '', ctaText: 'Get Started Free', ctaLink: '/auth/register', heroImage: '' },
  features: [],
  pricing: { title: 'Simple, Transparent Pricing', subtitle: 'Choose the plan that fits your business', showPlans: true },
  faq: [],
  testimonials: [],
  contact: { title: 'Contact Us', email: '', phone: '', address: '' },
  footer: { companyName: '', description: '', copyrightText: '', socialLinks: { facebook: '', twitter: '', instagram: '', linkedin: '', youtube: '' } },
  seo: { title: '', description: '' },
  isPublished: true,
};

function merge(base: LandingPageData, incoming: Partial<LandingPageData>): LandingPageData {
  return {
    ...base,
    ...incoming,
    hero: { ...base.hero, ...(incoming.hero || {}) },
    pricing: { ...base.pricing, ...(incoming.pricing || {}) },
    contact: { ...base.contact, ...(incoming.contact || {}) },
    footer: { ...base.footer, ...(incoming.footer || {}), socialLinks: { ...base.footer.socialLinks, ...(incoming.footer?.socialLinks || {}) } },
    seo: { ...base.seo, ...(incoming.seo || {}) },
    features: incoming.features?.length ? incoming.features : base.features,
    faq: incoming.faq?.length ? incoming.faq : base.faq,
    testimonials: incoming.testimonials?.length ? incoming.testimonials : base.testimonials,
  };
}

export default function LandingPageAdmin() {
  const [data, setData] = useState<LandingPageData>(defaultData);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getLandingPage().then(r => setData(merge(defaultData, r.data.data || {}))).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try { await adminApi.updateLandingPage({ ...data, isPublished: true }); toast.success('Landing page saved'); } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const addFeature = () => setData({ ...data, features: [...data.features, { icon: '', title: '', description: '' }] });
  const removeFeature = (i: number) => setData({ ...data, features: data.features.filter((_, idx) => idx !== i) });
  const addFaq = () => setData({ ...data, faq: [...data.faq, { question: '', answer: '' }] });
  const removeFaq = (i: number) => setData({ ...data, faq: data.faq.filter((_, idx) => idx !== i) });
  const addTestimonial = () => setData({ ...data, testimonials: [...data.testimonials, { name: '', company: '', text: '', avatar: '' }] });
  const removeTestimonial = (i: number) => setData({ ...data, testimonials: data.testimonials.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landing Page Setup</h1>
          <p className="text-sm text-gray-500 mt-1">Customize every section of your public landing page. Pricing plans come automatically from Admin → Plans.</p>
        </div>
        <Button onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>Save All</Button>
      </div>

      <Tabs tabs={[
        { key: 'hero', label: 'Hero', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <Input label="Title" value={data.hero.title} onChange={e => setData({ ...data, hero: { ...data.hero, title: e.target.value } })} />
              <Textarea label="Subtitle" value={data.hero.subtitle} onChange={e => setData({ ...data, hero: { ...data.hero, subtitle: e.target.value } })} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="CTA Text" value={data.hero.ctaText} onChange={e => setData({ ...data, hero: { ...data.hero, ctaText: e.target.value } })} />
                <Input label="CTA Link" value={data.hero.ctaLink} onChange={e => setData({ ...data, hero: { ...data.hero, ctaLink: e.target.value } })} />
              </div>
              <ImageUploadInput label="Hero Image" value={data.hero.heroImage} onChange={v => setData({ ...data, hero: { ...data.hero, heroImage: v } })} hint="Recommended: 800x600px or larger JPG/PNG" folder="landing" />
            </div>
          </Card>
        )},
        { key: 'features', label: 'Features', content: (
          <Card>
            {data.features.map((f, i) => (
              <div key={i} className="flex gap-3 items-start mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Input placeholder="Icon (message/zap/send/bot/users/chart/calendar/pipeline/phone)" value={f.icon} onChange={e => { const features = [...data.features]; features[i] = { ...f, icon: e.target.value }; setData({ ...data, features }); }} />
                  <Input placeholder="Title" value={f.title} onChange={e => { const features = [...data.features]; features[i] = { ...f, title: e.target.value }; setData({ ...data, features }); }} />
                  <Input placeholder="Description" value={f.description} onChange={e => { const features = [...data.features]; features[i] = { ...f, description: e.target.value }; setData({ ...data, features }); }} />
                </div>
                <button onClick={() => removeFeature(i)} className="text-red-400 mt-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addFeature} icon={<Plus className="w-3 h-3" />}>Add Feature</Button>
          </Card>
        )},
        { key: 'pricing', label: 'Pricing', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <Input label="Section Title" value={data.pricing.title} onChange={e => setData({ ...data, pricing: { ...data.pricing, title: e.target.value } })} />
              <Input label="Section Subtitle" value={data.pricing.subtitle} onChange={e => setData({ ...data, pricing: { ...data.pricing, subtitle: e.target.value } })} />
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={data.pricing.showPlans} onChange={e => setData({ ...data, pricing: { ...data.pricing, showPlans: e.target.checked } })} />
                Show pricing section on landing page
              </label>
              <p className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">Plans (name, price, features) automatically come from Admin → Plans. Edit plans there and the landing page updates automatically.</p>
            </div>
          </Card>
        )},
        { key: 'faq', label: 'FAQ', content: (
          <Card>
            {data.faq.map((f, i) => (
              <div key={i} className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input placeholder="Question" value={f.question} onChange={e => { const faq = [...data.faq]; faq[i] = { ...f, question: e.target.value }; setData({ ...data, faq }); }} />
                    <Textarea placeholder="Answer" value={f.answer} onChange={e => { const faq = [...data.faq]; faq[i] = { ...f, answer: e.target.value }; setData({ ...data, faq }); }} />
                  </div>
                  <button onClick={() => removeFaq(i)} className="text-red-400 mt-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addFaq} icon={<Plus className="w-3 h-3" />}>Add FAQ</Button>
          </Card>
        )},
        { key: 'testimonials', label: 'Testimonials', content: (
          <Card>
            {data.testimonials.map((t, i) => (
              <div key={i} className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input placeholder="Name" value={t.name} onChange={e => { const ts = [...data.testimonials]; ts[i] = { ...t, name: e.target.value }; setData({ ...data, testimonials: ts }); }} />
                    <Input placeholder="Company / Role" value={t.company} onChange={e => { const ts = [...data.testimonials]; ts[i] = { ...t, company: e.target.value }; setData({ ...data, testimonials: ts }); }} />
                    <Input placeholder="Avatar URL" value={t.avatar} onChange={e => { const ts = [...data.testimonials]; ts[i] = { ...t, avatar: e.target.value }; setData({ ...data, testimonials: ts }); }} className="col-span-2" />
                    <Textarea placeholder="Testimonial text" value={t.text} onChange={e => { const ts = [...data.testimonials]; ts[i] = { ...t, text: e.target.value }; setData({ ...data, testimonials: ts }); }} className="col-span-2" />
                  </div>
                  <button onClick={() => removeTestimonial(i)} className="text-red-400 mt-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addTestimonial} icon={<Plus className="w-3 h-3" />}>Add Testimonial</Button>
          </Card>
        )},
        { key: 'contact', label: 'Contact', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <Input label="Email" value={data.contact.email} onChange={e => setData({ ...data, contact: { ...data.contact, email: e.target.value } })} />
              <Input label="Phone" value={data.contact.phone} onChange={e => setData({ ...data, contact: { ...data.contact, phone: e.target.value } })} />
              <Textarea label="Address" value={data.contact.address} onChange={e => setData({ ...data, contact: { ...data.contact, address: e.target.value } })} />
            </div>
          </Card>
        )},
        { key: 'footer', label: 'Footer', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <Input label="Company Name" value={data.footer.companyName} onChange={e => setData({ ...data, footer: { ...data.footer, companyName: e.target.value } })} placeholder="WabaPanel" />
              <Textarea label="Company Description" value={data.footer.description} onChange={e => setData({ ...data, footer: { ...data.footer, description: e.target.value } })} placeholder="WhatsApp Business Platform for modern businesses." />
              <Input label="Copyright Text" value={data.footer.copyrightText} onChange={e => setData({ ...data, footer: { ...data.footer, copyrightText: e.target.value } })} placeholder="© 2026 WabaPanel. All rights reserved." />
            </div>
          </Card>
        )},
        { key: 'seo', label: 'SEO', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <Input label="Meta Title" value={data.seo.title} onChange={e => setData({ ...data, seo: { ...data.seo, title: e.target.value } })} />
              <Textarea label="Meta Description" value={data.seo.description} onChange={e => setData({ ...data, seo: { ...data.seo, description: e.target.value } })} />
            </div>
          </Card>
        )},
      ]} />
    </div>
  );
}
