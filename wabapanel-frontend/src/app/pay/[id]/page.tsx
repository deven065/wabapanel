'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface PayData { amount: number; description: string; method: string; link: string; upiId: string; status: string; businessName: string }

export default function PayPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PayData | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/payment-links/${id}/public`)
      .then(r => r.json())
      .then(r => { if (r.success) setData(r.data); else setError(r.message || 'Payment link not found'); })
      .catch(() => setError('Failed to load payment link'));
  }, [id]);

  const upiParams = () => {
    if (!data) return '';
    const q = data.link.split('?')[1] || '';
    return q;
  };

  const openApp = (scheme: string) => {
    window.location.href = `${scheme}?${upiParams()}`;
  };

  const copyUpi = async () => {
    if (!data?.upiId) return;
    try { await navigator.clipboard.writeText(data.upiId); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const qrUrl = data ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.link)}` : '';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 w-full max-w-sm p-6 text-center">
        {error ? (
          <p className="text-red-500 text-sm">{error}</p>
        ) : !data ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-1">{data.businessName || 'Payment Request'}</p>
            <p className="text-4xl font-bold text-gray-900 mb-2">₹{data.amount}</p>
            {data.description && <p className="text-sm text-gray-500 mb-3">{data.description}</p>}
            {data.status === 'paid' ? (
              <div className="bg-emerald-50 text-emerald-700 rounded-xl py-3 font-medium">✓ Already Paid</div>
            ) : data.status === 'cancelled' ? (
              <div className="bg-gray-100 text-gray-500 rounded-xl py-3 font-medium">Link Cancelled</div>
            ) : (
              <>
                <button onClick={() => openApp('upi://pay')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl py-3 mb-2">
                  Pay ₹{data.amount} — Open UPI App
                </button>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button onClick={() => openApp('tez://upi/pay')} className="border border-gray-200 rounded-lg py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">GPay</button>
                  <button onClick={() => openApp('phonepe://pay')} className="border border-gray-200 rounded-lg py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">PhonePe</button>
                  <button onClick={() => openApp('paytmmp://pay')} className="border border-gray-200 rounded-lg py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">Paytm</button>
                </div>
                <div className="border-t border-gray-100 pt-4 mb-4">
                  <p className="text-xs text-gray-400 mb-2">Or scan this QR from any UPI app</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="UPI QR" className="mx-auto rounded-lg border border-gray-100" width={180} height={180} />
                </div>
                {data.upiId && (
                  <button onClick={copyUpi} className="text-xs text-gray-500 hover:text-gray-700">
                    UPI ID: <span className="font-mono font-medium">{data.upiId}</span> — {copied ? 'Copied ✓' : 'tap to copy'}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
