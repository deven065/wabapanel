'use client';
import React, { useState, useEffect } from 'react';
import { Wallet, Plus, ArrowUpRight, ArrowDownLeft, CreditCard } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { paymentApi } from '@/lib/api';
import ManualPaymentModal, { ManualInfo } from '@/components/billing/ManualPaymentModal';
import { useAuthStore } from '@/stores/authStore';
import useBranding from '@/lib/useBranding';
import toast from 'react-hot-toast';

interface WalletTransaction {
  _id: string; type: string; amount: number; balance: number; description: string; createdAt: string; status: string;
  reference?: string;
}

export default function BillingPage() {
  const { currentWorkspace, user } = useAuthStore();
  const brand = useBranding();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTopUp, setShowTopUp] = useState(false);
  const [amount, setAmount] = useState('500');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gateways, setGateways] = useState<{ id: string; configured: boolean; autoRenewEnabled?: boolean; upiId?: string; qrImageUrl?: string; accountDetails?: string; instructions?: string }[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [showGatewayPick, setShowGatewayPick] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [autoTopup, setAutoTopup] = useState(false);
  const [autoTopupStatus, setAutoTopupStatus] = useState<{ active: boolean; amount?: number } | null>(null);
  const [cancellingAutoTopup, setCancellingAutoTopup] = useState(false);
  const walletBalance = user?.walletBalance ?? currentWorkspace?.walletBalance ?? 0;

  useEffect(() => {
    paymentApi.getWalletHistory().then(r => setTransactions(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
    paymentApi.getGateways().then(r => setGateways(r.data.data || [])).catch(() => {});
    loadAutoTopup();
    // Returning from a hosted gateway page (PhonePe/Cashfree/PayPal): confirm the payment.
    const params = new URLSearchParams(window.location.search);
    const hostedId = params.get('hostedPayment');
    if (hostedId) {
      window.history.replaceState({}, '', window.location.pathname);
      paymentApi.verifyHostedPayment(hostedId).then(r => {
        if (r.data.data?.status === 'completed') {
          toast.success(r.data.message || 'Payment confirmed — wallet credited!');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          toast(r.data.message || 'Payment not completed yet. If you already paid, refresh in a minute.', { icon: '⏳', duration: 8000 });
        }
      }).catch(() => toast.error('Could not verify the payment. If you were charged, contact support.'));
    }
  }, []);

  const loadAutoTopup = () => {
    paymentApi.getAutoRenewStatus().then(r => setAutoTopupStatus(r.data.data?.wallet || null)).catch(() => {});
  };

  const cancelAutoTopup = async () => {
    if (!confirm('Cancel monthly auto top-up?')) return;
    setCancellingAutoTopup(true);
    try {
      const r = await paymentApi.cancelAutoRenew('wallet');
      toast.success(r.data.message || 'Auto top-up cancelled');
      loadAutoTopup();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to cancel');
    }
    setCancellingAutoTopup(false);
  };

  const usableGateways = gateways.filter(g => g.configured && ['razorpay', 'manual', 'phonepe', 'cashfree', 'payu', 'paypal', 'paystack', 'instamojo', 'flutterwave', 'mollie', 'mercadopago'].includes(g.id));

  const handleTopUp = async () => {
    if (submitting) return;
    if (usableGateways.length === 0) {
      toast.error('No payment method is enabled. Ask admin to enable a gateway (Razorpay, PhonePe, Cashfree, PayU, PayPal or Manual) in Payment Gateways.');
      return;
    }
    // Let the customer choose when more than one method is enabled.
    if (usableGateways.length > 1) {
      setShowTopUp(false);
      setShowGatewayPick(true);
      return;
    }
    await proceedTopUp(usableGateways[0].id);
  };

  const proceedTopUp = async (gateway: string) => {
    if (submitting) return;
    setSubmitting(true);

    // Hosted gateways: backend returns a payment-page URL to redirect to.
    if (['phonepe', 'cashfree', 'payu', 'paypal', 'paystack', 'instamojo', 'flutterwave', 'mollie', 'mercadopago'].includes(gateway)) {
      setTopUpLoading(true);
      try {
        const res = await paymentApi.topUpWallet({ amount: parseFloat(amount), gateway });
        const order = res.data.data;
        if (order?.sessionUrl) { window.location.href = order.sessionUrl; return; }
        toast.error('Could not start the payment. Try again.');
      } catch (err: unknown) {
        const error = err as { response?: { data?: { message?: string } } };
        toast.error(error.response?.data?.message || 'Failed');
      } finally {
        setSubmitting(false);
        setShowTopUp(false);
        setTopUpLoading(false);
      }
      return;
    }

    if (gateway === 'manual') {
      setShowTopUp(false);
      setSubmitting(false);
      setShowManual(true);
      return;
    }

    setTopUpLoading(true);
    try {
      const res = await paymentApi.topUpWallet({ amount: parseFloat(amount), gateway, ...(autoTopup ? { autoRenew: true } : {}) });
      const order = res.data.data;
      if (typeof window === 'undefined' || !(window as unknown as Record<string, unknown>).Razorpay) {
        toast.error('Payment system not loaded. Refresh the page and try again.');
        return;
      }
      const options = {
        key: order.keyId,
        ...(order.subscriptionId
          ? { subscription_id: order.subscriptionId }
          : { amount: order.amount, currency: 'INR', order_id: order.orderId }),
        name: brand.name, description: order.subscriptionId ? 'Monthly Auto Wallet Top-up' : 'Wallet Top-up',
        handler: async (response: Record<string, string>) => {
          try {
            await paymentApi.verifyWalletTopup({
              paymentId: order.paymentId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success('Wallet topped up!'); window.location.reload();
          } catch { toast.error('Payment verification failed'); }
        },
        prefill: { email: user?.email, name: user?.name },
        theme: { color: '#10b981' },
      };
      const rzp = new ((window as unknown as Record<string, new (o: unknown) => { open: () => void }>).Razorpay)(options);
      (rzp as { open: () => void }).open();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    } finally {
      setSubmitting(false);
      setShowTopUp(false);
      setTopUpLoading(false);
    }
  };

  const manualInfo: ManualInfo = (() => {
    const m = gateways.find(g => g.id === 'manual');
    return { upiId: m?.upiId, qrImageUrl: m?.qrImageUrl, accountDetails: m?.accountDetails, instructions: m?.instructions };
  })();

  const submitManual = async (reference: string, proofUrl: string) => {
    setManualSubmitting(true);
    try {
      const res = await paymentApi.topUpWallet({ amount: parseFloat(amount), gateway: 'manual', reference, proofUrl });
      toast.success(res.data.message || 'Top-up request submitted. Admin will confirm.');
      setShowManual(false);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setManualSubmitting(false);
  };

  const columns = [
    { key: 'type', title: 'Type', render: (t: WalletTransaction) => (
      <div className="flex items-center gap-2">
        {t.type === 'credit' ? <ArrowDownLeft className="w-4 h-4 text-emerald-500" /> : <ArrowUpRight className="w-4 h-4 text-red-500" />}
        <span className="capitalize">{t.type}</span>
      </div>
    )},
    { key: 'desc', title: 'Description', render: (t: WalletTransaction) => t.description },
    { key: 'amount', title: 'Amount', render: (t: WalletTransaction) => (
      <span className={t.type === 'credit' ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
        {t.type === 'credit' ? '+' : '-'}₹{t.amount.toFixed(2)}
      </span>
    )},
    { key: 'balance', title: 'Balance', render: (t: WalletTransaction) => `₹${t.balance.toFixed(2)}` },
    { key: 'date', title: 'Date', render: (t: WalletTransaction) => new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    { key: 'status', title: 'Status', render: (t: WalletTransaction) => <Badge variant={t.status === 'completed' ? 'success' : t.status === 'pending' ? 'warning' : 'default'}>{t.status}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Wallet</h1>
          <p className="text-gray-500 text-sm mt-1">Manage credits and transactions</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowTopUp(true)}>Top Up</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-emerald-100 text-sm">Wallet Balance</p>
              <p className="text-2xl font-bold">₹{walletBalance.toFixed(2)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-gray-500 text-sm">Current Plan</p>
              <p className="text-lg font-bold text-gray-900">{((user as unknown as { plan?: { name?: string } })?.plan)?.name || (currentWorkspace?.plan as { name?: string })?.name || 'Free'}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-gray-500 text-sm">This Month Spent</p>
              <p className="text-lg font-bold text-gray-900">
                ₹{transactions.filter(t => t.type === 'debit' && new Date(t.createdAt).getMonth() === new Date().getMonth()).reduce((a, t) => a + t.amount, 0).toFixed(2)}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <ArrowDownLeft className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-gray-500 text-sm">Total Credits</p>
              <p className="text-lg font-bold text-emerald-600">₹{transactions.filter(t => t.type === 'credit').reduce((a, t) => a + t.amount, 0).toFixed(2)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-gray-500 text-sm">Total Debits</p>
              <p className="text-lg font-bold text-red-600">₹{transactions.filter(t => t.type === 'debit').reduce((a, t) => a + t.amount, 0).toFixed(2)}</p>
            </div>
          </div>
        </Card>
      </div>

      {autoTopupStatus?.active && (
        <Card className="bg-blue-50 border border-blue-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm text-blue-600 font-medium">Auto Top-up is ON</p>
              <p className="text-sm text-gray-700 mt-1">₹{autoTopupStatus.amount} is added to your wallet automatically every month.</p>
            </div>
            <Button variant="outline" onClick={cancelAutoTopup} loading={cancellingAutoTopup}>Cancel Auto Top-up</Button>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h3>
        <Table columns={columns} data={transactions} loading={loading} emptyText="No transactions yet" />
      </Card>

      <Modal isOpen={showTopUp} onClose={() => setShowTopUp(false)} title="Top Up Wallet">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {['500', '1000', '2000', '5000', '10000', '25000'].map(val => (
              <button key={val} onClick={() => setAmount(val)}
                className={`p-3 rounded-lg text-center text-sm font-medium border ${amount === val ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                ₹{val}
              </button>
            ))}
          </div>
          <Input label="Custom Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="100" />
          {gateways.some(g => g.id === 'razorpay' && g.configured && g.autoRenewEnabled !== false) && !autoTopupStatus?.active && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={autoTopup} onChange={e => setAutoTopup(e.target.checked)} className="rounded" />
              Auto top-up ₹{amount} every month (Razorpay auto-debit) — cancel anytime
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowTopUp(false)}>Cancel</Button>
            <Button onClick={handleTopUp} loading={topUpLoading}>Pay ₹{amount}</Button>
          </div>
        </div>
      </Modal>
      <ManualPaymentModal
        isOpen={showManual}
        onClose={() => setShowManual(false)}
        amount={parseFloat(amount) || 0}
        info={manualInfo}
        submitting={manualSubmitting}
        onConfirm={submitManual}
      />
      {showGatewayPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowGatewayPick(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Choose payment method</h3>
            <p className="text-sm text-gray-500 mb-4">Wallet top-up — ₹{amount}</p>
            <div className="space-y-2">
              {usableGateways.map(g => (
                <button key={g.id}
                  className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                  onClick={() => { setShowGatewayPick(false); proceedTopUp(g.id); }}>
                  <span className="font-medium text-gray-900">
                    {{ razorpay: 'Razorpay', stripe: 'Stripe', paypal: 'PayPal', phonepe: 'PhonePe', cashfree: 'Cashfree', payu: 'PayU', paystack: 'Paystack', instamojo: 'Instamojo', flutterwave: 'Flutterwave', mollie: 'Mollie', mercadopago: 'Mercado Pago' }[g.id] || 'Manual / UPI / Bank Transfer'}
                  </span>
                </button>
              ))}
            </div>
            <button className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700" onClick={() => setShowGatewayPick(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
