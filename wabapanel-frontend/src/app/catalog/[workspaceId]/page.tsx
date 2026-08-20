'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import axios from 'axios';

interface PublicProduct {
  _id: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  category?: string;
  images?: string[];
  url?: string;
  availability?: string;
}

interface PublicCatalog {
  name: string;
  products: PublicProduct[];
  gateways?: string[];
  currency?: string;
}

const money = (p?: number, cur?: string) => {
  if (!p && p !== 0) return '';
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'INR' ? '₹' : '';
  return sym ? `${sym}${p}` : `${cur || ''} ${p}`.trim();
};

const availLabel = (a?: string) =>
  a === 'out_of_stock' ? 'Out of stock' : a === 'preorder' ? 'Pre-order' : 'In stock';

const GATEWAY_LABELS: Record<string, string> = {
  razorpay: 'Razorpay', stripe: 'Card (Stripe)', paypal: 'PayPal', cashfree: 'Cashfree',
  paystack: 'Paystack', mercadopago: 'Mercado Pago', phonepe: 'PhonePe', paytm: 'Paytm',
};

const apiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `${window.location.origin}/api`;
  return '/api';
};

export default function PublicCatalogPage() {
  const params = useParams();
  const search = useSearchParams();
  const wsId = params.workspaceId as string;
  const [data, setData] = useState<PublicCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cart: productId -> quantity
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState<string>('');
  const [form, setForm] = useState({ name: '', phone: '', address: '', city: '', pincode: '', method: '' });

  useEffect(() => {
    if (!wsId) return;
    axios.get(`${apiBaseUrl()}/catalogs/public/${wsId}`)
      .then(res => {
        if (res.data.success) setData(res.data.data);
        else setError('Catalogue not found');
      })
      .catch(() => setError('Catalogue not found'))
      .finally(() => setLoading(false));
  }, [wsId]);

  useEffect(() => {
    if (search && search.get('paid') === '1') setDone('paid');
  }, [search]);

  const products = data?.products || [];
  const gateways = data?.gateways || [];
  const setQty = (id: string, q: number) => {
    setCart(prev => {
      const next = { ...prev };
      if (q <= 0) delete next[id]; else next[id] = q;
      return next;
    });
  };
  const cartItems = products.filter(p => cart[p._id] > 0);
  const cartCount = cartItems.reduce((n, p) => n + cart[p._id], 0);
  const cartTotal = cartItems.reduce((sum, p) => sum + (p.price || 0) * cart[p._id], 0);
  const cur = data?.currency || 'INR';

  const placeOrder = async () => {
    if (placing) return;
    if (!form.name.trim() || !form.phone.trim()) { setError('Please enter your name and phone'); return; }
    setError('');
    setPlacing(true);
    try {
      const res = await axios.post(`${apiBaseUrl()}/catalogs/public/${wsId}/order`, {
        items: cartItems.map(p => ({ productId: p._id, quantity: cart[p._id] })),
        customer: { name: form.name, phone: form.phone, address: form.address, city: form.city, pincode: form.pincode },
        method: form.method || undefined,
      });
      const d = res.data.data;
      if (d.payUrl) {
        window.location.href = d.payUrl;
        return;
      }
      setDone(d.orderNumber || 'placed');
      setCart({});
      setShowCheckout(false);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message || 'Could not place the order. Please try again.');
    }
    setPlacing(false);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  }
  if (error && !data) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">{error || 'Catalogue not found'}</div>;
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Catalogue not found</div>;
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
          <h2 className="text-lg font-semibold text-gray-900">
            {done === 'paid' ? 'Payment received!' : 'Order placed!'}
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            {done === 'paid'
              ? 'Thank you — your payment was successful. We will contact you shortly.'
              : `Thank you! ${done !== 'placed' ? `Your order number is ${done}. ` : ''}The store will contact you on WhatsApp to confirm.`}
          </p>
          <button onClick={() => { setDone(''); }} className="mt-6 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2">
            Back to catalogue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-emerald-600 text-white py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold">{data.name}</h1>
          <p className="text-emerald-100 text-sm mt-1">{products.length} product(s)</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {products.length === 0 ? (
          <p className="text-center text-gray-400 py-16">No products available yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(p => {
              const soldOut = p.availability === 'out_of_stock';
              const qty = cart[p._id] || 0;
              return (
                <div key={p._id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm flex flex-col">
                  <div className="aspect-square bg-gray-100 flex items-center justify-center">
                    {p.images && p.images[0]
                      ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                      : <span className="text-gray-300 text-sm">No image</span>}
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-gray-900 text-sm">{p.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${soldOut ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{availLabel(p.availability)}</span>
                    </div>
                    {p.category ? <p className="text-[11px] text-gray-400 mt-0.5">{p.category}</p> : null}
                    {p.description ? <p className="text-xs text-gray-500 mt-2 line-clamp-3">{p.description}</p> : null}
                    {(p.price || p.price === 0) ? <p className="text-emerald-600 font-semibold mt-3">{money(p.price, p.currency)}</p> : null}
                    <div className="mt-3 pt-1 mt-auto">
                      {soldOut ? (
                        <button disabled className="w-full text-sm bg-gray-100 text-gray-400 rounded-lg py-2 cursor-not-allowed">Out of stock</button>
                      ) : qty === 0 ? (
                        <button onClick={() => setQty(p._id, 1)} className="w-full text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2">Add to cart</button>
                      ) : (
                        <div className="flex items-center justify-between border border-emerald-200 rounded-lg overflow-hidden">
                          <button onClick={() => setQty(p._id, qty - 1)} className="px-4 py-2 text-emerald-700 hover:bg-emerald-50 text-lg">−</button>
                          <span className="text-sm font-medium text-gray-900">{qty}</span>
                          <button onClick={() => setQty(p._id, qty + 1)} className="px-4 py-2 text-emerald-700 hover:bg-emerald-50 text-lg">+</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {cartCount > 0 && !showCheckout && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 shadow-lg">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">{cartCount}</span> item(s) · <span className="font-semibold text-emerald-600">{money(cartTotal, cur)}</span>
            </div>
            <button onClick={() => setShowCheckout(true)} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-6 py-2 font-medium">
              Checkout
            </button>
          </div>
        </div>
      )}

      {showCheckout && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-900">Checkout</h3>
              <button onClick={() => setShowCheckout(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                {cartItems.map(p => (
                  <div key={p._id} className="flex justify-between text-gray-600">
                    <span>{p.name} × {cart[p._id]}</span>
                    <span>{money((p.price || 0) * cart[p._id], p.currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200 mt-1">
                  <span>Total</span><span>{money(cartTotal, cur)}</span>
                </div>
              </div>

              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name *" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="WhatsApp number *" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Delivery address" rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="City" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <input value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} placeholder="Pincode" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>

              {gateways.length > 1 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Payment method</label>
                  <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {gateways.map(g => <option key={g} value={g}>{GATEWAY_LABELS[g] || g}</option>)}
                  </select>
                </div>
              )}

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <button onClick={placeOrder} disabled={placing} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-medium">
                {placing ? 'Placing...' : gateways.length > 0 ? `Pay ${money(cartTotal, cur)}` : `Place order (${money(cartTotal, cur)})`}
              </button>
              {gateways.length === 0 ? (
                <p className="text-[11px] text-gray-400 text-center">No online payment set up — the store will confirm your order on WhatsApp.</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
