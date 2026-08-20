'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Package, Image, RefreshCw, Link2, Share2, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import ImageUploadInput from '@/components/ui/ImageUploadInput';
import { catalogApi, contactApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Product {
  _id: string; name: string; description: string; price: number; currency: string;
  category: string; imageUrl: string; images?: string[]; status: string; sku: string; stock: number;
}

interface ShareContact { _id: string; name: string; phone: string }

export default function CatalogsPage() {
  const { currentWorkspace } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', currency: 'INR', category: '', imageUrl: '', sku: '', stock: '' });
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [shareProduct, setShareProduct] = useState<Product | 'catalog' | null>(null);
  const [shareContacts, setShareContacts] = useState<ShareContact[]>([]);
  const [shareSearch, setShareSearch] = useState('');
  const [sharing, setSharing] = useState('');

  const publicLink = currentWorkspace ? `${typeof window !== 'undefined' ? window.location.origin : ''}/catalog/${currentWorkspace._id}` : '';

  const fetch = () => {
    if (!currentWorkspace) return;
    catalogApi.getProducts().then(r => setProducts(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, [currentWorkspace]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicLink); toast.success('Catalogue link copied'); }
    catch { toast.error('Copy failed'); }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await catalogApi.sync();
      toast.success(r.data.data?.message || `Synced ${r.data.data?.synced ?? ''} product(s) to WhatsApp`);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Sync failed');
    }
    setSyncing(false);
  };

  const openShare = (target: Product | 'catalog') => {
    setShareProduct(target);
    setShareSearch('');
    contactApi.list({ limit: 30 }).then(r => setShareContacts(r.data.data || [])).catch(() => setShareContacts([]));
  };

  const searchShareContacts = (q: string) => {
    setShareSearch(q);
    contactApi.list({ limit: 30, search: q }).then(r => setShareContacts(r.data.data || [])).catch(() => {});
  };

  const doShare = async (contactId: string) => {
    if (sharing || !shareProduct) return;
    setSharing(contactId);
    try {
      await catalogApi.share({ contactId, productId: shareProduct === 'catalog' ? undefined : shareProduct._id });
      toast.success('Sent on WhatsApp');
      setShareProduct(null);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to send');
    }
    setSharing('');
  };

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const payload = { ...form, price: Number(form.price), stock: Number(form.stock), images: form.imageUrl ? [form.imageUrl] : [] };
      if (editItem) await catalogApi.updateProduct(editItem._id, payload);
      else await catalogApi.createProduct(payload);
      toast.success(editItem ? 'Updated' : 'Created'); setShowModal(false); fetch();
    } catch { toast.error('Failed'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Product Catalogue</h1><p className="text-sm text-gray-500 mt-1">{products.length} products</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Link2 className="w-4 h-4" />} onClick={copyLink}>Copy Link</Button>
          <Button variant="outline" icon={<Share2 className="w-4 h-4" />} onClick={() => openShare('catalog')}>Share Catalogue</Button>
          <Button variant="outline" icon={<RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />} onClick={handleSync} loading={syncing}>Sync to WhatsApp</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditItem(null); setForm({ name: '', description: '', price: '', currency: 'INR', category: '', imageUrl: '', sku: '', stock: '' }); setShowModal(true); }}>Add Product</Button>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : products.length === 0 ? (
        <Card><div className="text-center py-12"><Package className="w-16 h-16 text-gray-200 mx-auto mb-4" /><h3 className="text-lg font-medium text-gray-900 mb-2">No products yet</h3><p className="text-gray-500 mb-4">Add products to your catalogue to share via WhatsApp</p><Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>Add Product</Button></div></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map(p => (
            <Card key={p._id} className="overflow-hidden">
              <div className="aspect-square bg-gray-100 flex items-center justify-center">
                {(p.imageUrl || p.images?.[0]) ? <img src={p.imageUrl || p.images?.[0]} alt={p.name} className="w-full h-full object-cover" /> : <Image className="w-12 h-12 text-gray-300" />}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-gray-900 text-sm line-clamp-1">{p.name}</h3>
                  <Badge variant={p.status === 'active' ? 'success' : 'warning'} className="text-xs">{p.status}</Badge>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 mb-2">{p.description}</p>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-600">₹{p.price}</span>
                  <span className="text-xs text-gray-400">Stock: {p.stock}</span>
                </div>
                <div className="flex gap-1 mt-3">
                  <button onClick={() => { setEditItem(p); setForm({ name: p.name, description: p.description, price: String(p.price), currency: p.currency, category: p.category, imageUrl: p.imageUrl || p.images?.[0] || '', sku: p.sku, stock: String(p.stock) }); setShowModal(true); }} className="flex-1 text-center py-1.5 text-sm bg-gray-50 hover:bg-gray-100 rounded text-gray-600">Edit</button>
                  <button onClick={() => openShare(p)} className="px-3 py-1.5 text-sm bg-emerald-50 hover:bg-emerald-100 rounded text-emerald-600 inline-flex items-center gap-1"><Share2 className="w-3.5 h-3.5" />Share</button>
                  <button onClick={() => { if (confirm('Delete?')) catalogApi.deleteProduct(p._id).then(() => { fetch(); toast.success('Product deleted'); }).catch(() => toast.error('Delete failed')); }} className="px-3 py-1.5 text-sm bg-red-50 hover:bg-red-100 rounded text-red-600">Delete</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Product' : 'Add Product'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Product Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            <Input label="SKU" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
          </div>
          <Textarea label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Price" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
            <Input label="Currency" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
            <Input label="Stock" type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
          </div>
          <Input label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
          <ImageUploadInput label="Product Image" value={form.imageUrl} onChange={v => setForm({ ...form, imageUrl: v })} hint="Recommended: 600x600px square JPG/PNG" folder="products" />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></div>
        </div>
      </Modal>

      <Modal isOpen={!!shareProduct} onClose={() => setShareProduct(null)} title={shareProduct && shareProduct !== 'catalog' ? `Share "${shareProduct.name}"` : 'Share Catalogue'} size="md">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Pick a contact — the {shareProduct === 'catalog' ? 'catalogue link' : 'product'} will be sent to them on WhatsApp.</p>
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-500">
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{publicLink}</span>
            <button onClick={copyLink} className="ml-auto text-emerald-600 hover:underline shrink-0">Copy</button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={shareSearch} onChange={e => searchShareContacts(e.target.value)} placeholder="Search contacts..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border rounded-lg">
            {shareContacts.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">No contacts found</p>
            ) : shareContacts.map(c => (
              <div key={c._id} className="flex items-center justify-between px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name || c.phone}</p>
                  <p className="text-xs text-gray-500">{c.phone}</p>
                </div>
                <Button variant="outline" onClick={() => doShare(c._id)} loading={sharing === c._id} className="!py-1 !px-3 text-xs">Send</Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
