'use client';
import React, { useState, useEffect } from 'react';
import { Check, Star, Zap, Crown, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { paymentApi, platformApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';
import type { Plan } from '@/types';
import ManualPaymentModal, { ManualInfo } from '@/components/billing/ManualPaymentModal';

export default function SubscriptionsPage() {
  const { user, currentWorkspace } = useAuthStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [gateways, setGateways] = useState<{ id: string; configured: boolean; autoRenewEnabled?: boolean; allowInternational?: boolean; upiId?: string; qrImageUrl?: string; accountDetails?: string; instructions?: string }[]>([]);
  const [currencies, setCurrencies] = useState<{ code: string; name: string; symbol: string; rate: number; isDefault: boolean }[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('INR');
  const [selectedCurrency, setSelectedCurrency] = useState('INR');
  const [brandName, setBrandName] = useState('WabaPanel');
  const [showManual, setShowManual] = useState(false);
  const [manualPlan, setManualPlan] = useState<Plan | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [trialStarting, setTrialStarting] = useState<string | null>(null);
  const [pendingPayments, setPendingPayments] = useState<{ _id: string; plan?: { _id: string; name: string }; amount: number; createdAt: string }[]>([]);
  const [gatewayPlan, setGatewayPlan] = useState<Plan | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const cyclePrice = (plan: Plan): number => {
    const m = plan.price || 0;
    if (billingCycle === 'quarterly') return (plan.quarterlyPrice ?? 0) > 0 ? (plan.quarterlyPrice as number) : Math.round(m * 3);
    if (billingCycle === 'yearly') return (plan.yearlyPrice ?? 0) > 0 ? (plan.yearlyPrice as number) : Math.round(m * 10);
    return m;
  };
  const cycleSuffix = billingCycle === 'quarterly' ? 'quarter' : billingCycle === 'yearly' ? 'year' : 'month';
  const isForeign = selectedCurrency.toUpperCase() !== baseCurrency.toUpperCase();
  const curInfo = (code: string) => currencies.find(c => c.code.toUpperCase() === code.toUpperCase());
  const baseSymbol = curInfo(baseCurrency)?.symbol || '₹';
  // Mirrors the backend resolvePlanPrice() so the shown price == the charged price.
  const resolvePrice = (plan: Plan): { amount: number; currency: string; symbol: string } => {
    const base = cyclePrice(plan);
    if (!isForeign) return { amount: base, currency: baseCurrency.toUpperCase(), symbol: baseSymbol };
    const cur = curInfo(selectedCurrency);
    if (!cur) return { amount: base, currency: baseCurrency.toUpperCase(), symbol: baseSymbol };
    const p = plan as unknown as { pricingMode?: string; prices?: { currency: string; monthly: number; quarterly: number; yearly: number }[] };
    if ((p.pricingMode || 'manual') === 'exchange') {
      const rate = Number(cur.rate) > 0 ? Number(cur.rate) : 0;
      return rate ? { amount: Math.round(base * rate), currency: cur.code.toUpperCase(), symbol: cur.symbol } : { amount: base, currency: baseCurrency.toUpperCase(), symbol: baseSymbol };
    }
    const row = (p.prices || []).find(r => (r.currency || '').toUpperCase() === selectedCurrency.toUpperCase());
    const amt = row ? Number(row[billingCycle] || 0) : 0;
    return amt > 0 ? { amount: amt, currency: cur.code.toUpperCase(), symbol: cur.symbol } : { amount: base, currency: baseCurrency.toUpperCase(), symbol: baseSymbol };
  };
  const priceLabel = (plan: Plan) => { const r = resolvePrice(plan); return `${r.symbol}${r.amount}`; };
  const loadGateways = (cur?: string) => {
    const foreign = cur ? cur.toUpperCase() !== baseCurrency.toUpperCase() : false;
    paymentApi.getGateways(foreign ? cur : undefined).then(r => {
      const gws = r.data.data || [];
      setGateways(gws);
      if (gws.some((g: { id: string; configured: boolean; autoRenewEnabled?: boolean }) => g.id === 'razorpay' && g.configured && g.autoRenewEnabled !== false)) setAutoRenew(true);
    }).catch(() => {});
  };
  const [autoRenewStatus, setAutoRenewStatus] = useState<{ active: boolean; planName?: string; interval?: string; endDate?: string } | null>(null);
  const [cancellingAutoRenew, setCancellingAutoRenew] = useState(false);
  const rawPlan = ((user as unknown as { plan?: Plan })?.plan) || (currentWorkspace?.plan as Plan | undefined);
  const currentPlan: Plan | undefined = rawPlan && plans.some(p => p._id === rawPlan._id) ? rawPlan : plans.find(p => p.price === 0);

  useEffect(() => {
    paymentApi.getPlans().then(r => setPlans(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
    platformApi.publicBranding().then(r => { const n = r.data?.data?.name; if (n) setBrandName(n); }).catch(() => {});
    paymentApi.getCurrencies().then(r => {
      const list = r.data.data?.currencies || [];
      const bc = (r.data.data?.baseCurrency || 'INR').toUpperCase();
      setCurrencies(list);
      setBaseCurrency(bc);
      try {
        const region = (navigator.language.split('-')[1] || '').toUpperCase();
        const map: Record<string, string> = { US: 'USD', GB: 'GBP', IN: 'INR', AE: 'AED', SA: 'SAR', AU: 'AUD', CA: 'CAD', SG: 'SGD', MY: 'MYR', JP: 'JPY', CN: 'CNY', HK: 'HKD', NZ: 'NZD', ZA: 'ZAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', BD: 'BDT', PK: 'PKR', LK: 'LKR', NP: 'NPR', ID: 'IDR', PH: 'PHP', TH: 'THB', VN: 'VND', KR: 'KRW', TR: 'TRY', RU: 'RUB', BR: 'BRL', MX: 'MXN', NG: 'NGN', KE: 'KES', EG: 'EGP', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', IL: 'ILS' };
        const guess = map[region];
        setSelectedCurrency(guess && list.some((c: { code: string }) => c.code.toUpperCase() === guess) ? guess : bc);
      } catch { setSelectedCurrency(bc); }
    }).catch(() => {});
    loadPendingPayments();
    loadAutoRenew();
    // Returning from a hosted gateway page (PhonePe/Cashfree/PayPal): confirm the payment.
    const params = new URLSearchParams(window.location.search);
    const hostedId = params.get('hostedPayment');
    if (hostedId) {
      window.history.replaceState({}, '', window.location.pathname);
      paymentApi.verifyHostedPayment(hostedId).then(r => {
        if (r.data.data?.status === 'completed') {
          toast.success(r.data.message || 'Payment confirmed — plan activated!');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          toast(r.data.message || 'Payment not completed yet. If you already paid, refresh in a minute.', { icon: '⏳', duration: 8000 });
        }
      }).catch(() => toast.error('Could not verify the payment. If you were charged, contact support.'));
    }
  }, []);

  // Reload gateways whenever the selected currency changes (foreign = only intl-enabled gateways).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadGateways(selectedCurrency); }, [selectedCurrency, baseCurrency]);

  const loadAutoRenew = () => {
    paymentApi.getAutoRenewStatus().then(r => {
      const st = r.data.data?.plan || null;
      setAutoRenewStatus(st);
      if (st?.active) setAutoRenew(false);
    }).catch(() => {});
  };

  const cancelAutoRenewPlan = async () => {
    if (!confirm('Cancel auto-renew? Your plan will stay active till its expiry date, but will not renew automatically.')) return;
    setCancellingAutoRenew(true);
    try {
      const r = await paymentApi.cancelAutoRenew('plan');
      toast.success(r.data.message || 'Auto-renew cancelled');
      loadAutoRenew();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to cancel auto-renew');
    }
    setCancellingAutoRenew(false);
  };

  const loadPendingPayments = () => {
    paymentApi.getHistory().then(r => {
      const all = (r.data.data || []) as { _id: string; gateway: string; type: string; status: string; plan?: { _id: string; name: string }; amount: number; createdAt: string }[];
      setPendingPayments(all.filter(p => p.gateway === 'manual' && p.type === 'subscription' && p.status === 'pending'));
    }).catch(() => {});
  };

  const usableGateways = gateways.filter(g => g.configured && ['razorpay', 'stripe', 'manual', 'paypal', 'phonepe', 'cashfree', 'payu', 'paystack', 'instamojo', 'flutterwave', 'mollie', 'mercadopago'].includes(g.id));

  const handleSubscribe = async (planId: string) => {
    const plan = plans.find(p => p._id === planId);
    if (plan && plan.price > 0) {
      if (usableGateways.length === 0) {
        toast.error('No payment method is enabled. Ask admin to enable a gateway (Razorpay, PhonePe, Cashfree, PayU, Paystack, Instamojo, Flutterwave, Mollie, Mercado Pago, Stripe, PayPal or Manual) in Payment Gateways.');
        return;
      }
      if (usableGateways.length > 1) {
        setGatewayPlan(plan);
        return;
      }
    }
    const gateway = plan && plan.price > 0 ? usableGateways[0].id : 'manual';
    await proceedWithGateway(planId, gateway);
  };

  const proceedWithGateway = async (planId: string, gateway: string, forceAutoRenew = false) => {
    if (submitting) return;
    setSubmitting(true);

    setSubscribing(planId);
    try {
      const plan = plans.find(p => p._id === planId);
      if (gateway === 'manual' && plan && plan.price > 0) {
        setManualPlan(plan);
        setShowManual(true);
        setSubmitting(false);
        setSubscribing(null);
        return;
      }
      const resolved = plan ? resolvePrice(plan) : { currency: baseCurrency.toUpperCase() };
      const foreign = resolved.currency.toUpperCase() !== baseCurrency.toUpperCase();
      // A coupon can't be combined with a Razorpay recurring mandate (fixed amount),
      // so an applied coupon takes precedence: pay once at the discounted price.
      const useAutoRenew = !foreign && gateway === 'razorpay' && (autoRenew || forceAutoRenew) && !couponApplied;
      const res = await paymentApi.subscribe(planId, gateway, {
        cycle: billingCycle,
        currency: resolved.currency,
        ...(couponApplied && !useAutoRenew && !foreign ? { couponCode: couponApplied.code } : {}),
        ...(useAutoRenew ? { autoRenew: true } : {}),
      });
      const order = res.data.data;
      // Stripe: backend returns a hosted checkout URL.
      if (order?.sessionUrl) {
        window.location.href = order.sessionUrl; return;
      }
      // Free plan: backend activates directly, no Razorpay order returned.
      if (!order?.orderId && !order?.subscriptionId) {
        toast.success(res.data.message || 'Plan activated!'); window.location.reload(); return;
      }
      if (typeof window === 'undefined' || !(window as unknown as Record<string, unknown>).Razorpay) {
        toast.error('Payment system not loaded. Refresh the page and try again.');
        return;
      }
      const options = {
        key: order.keyId,
        ...(order.subscriptionId
          ? { subscription_id: order.subscriptionId }
          : { amount: order.amount, currency: order.currency || 'INR', order_id: order.orderId }),
        name: brandName, description: order.subscriptionId ? 'Plan Subscription (Auto-renew)' : 'Plan Subscription',
        handler: async (response: Record<string, string>) => {
          try {
            await paymentApi.verifyPayment({
              paymentId: order.paymentId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success('Subscription activated!'); window.location.reload();
          } catch { toast.error('Payment verification failed'); }
        },
        prefill: { email: user?.email, name: user?.name },
        theme: { color: '#10b981' },
      };
      const rzp = new ((window as unknown as Record<string, new (o: unknown) => { open: () => void }>).Razorpay)(options);
      (rzp as { open: () => void }).open();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to start payment');
    } finally {
      setSubmitting(false);
      setSubscribing(null);
    }
  };

  const manualInfo: ManualInfo = (() => {
    const m = gateways.find(g => g.id === 'manual');
    return { upiId: m?.upiId, qrImageUrl: m?.qrImageUrl, accountDetails: m?.accountDetails, instructions: m?.instructions };
  })();

  const submitManualSub = async (reference: string, proofUrl: string) => {
    if (!manualPlan) return;
    setManualSubmitting(true);
    try {
      const mResolved = resolvePrice(manualPlan);
      const mForeign = mResolved.currency.toUpperCase() !== baseCurrency.toUpperCase();
      const res = await paymentApi.subscribe(manualPlan._id, 'manual', { reference, proofUrl, cycle: billingCycle, currency: mResolved.currency, ...(couponApplied && !mForeign ? { couponCode: couponApplied.code } : {}) });
      toast.success(res.data.message || 'Request submitted. Admin will confirm & activate your plan.');
      setShowManual(false);
      loadPendingPayments();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed');
    }
    setManualSubmitting(false);
  };

  const applyCouponCode = async () => {
    if (!couponCode.trim()) return;
    setCouponChecking(true);
    try {
      const maxPrice = Math.max(...plans.map(p => p.price || 0), 0);
      const r = await platformApi.validateCoupon(couponCode.trim(), maxPrice);
      setCouponApplied({ code: r.data.data.code, discount: r.data.data.discountType === 'percent' ? r.data.data.discountValue : r.data.data.discount });
      toast.success(`Coupon ${r.data.data.code} applied — ${r.data.data.discountType === 'percent' ? r.data.data.discountValue + '% off' : 'Rs.' + r.data.data.discount + ' off'}`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Invalid coupon');
      setCouponApplied(null);
    }
    setCouponChecking(false);
  };

  const startTrial = async (planId: string) => {
    const plan = plans.find(p => p._id === planId) as (Plan & { trialRequiresMandate?: boolean }) | undefined;
    if (plan?.trialRequiresMandate && gateways.some(g => g.id === 'razorpay' && g.configured && g.autoRenewEnabled !== false)) {
      await proceedWithGateway(planId, 'razorpay', true);
      return;
    }
    setTrialStarting(planId);
    try {
      const r = await paymentApi.startTrial(planId);
      toast.success(r.data.message || 'Free trial activated!');
      window.location.reload();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to start trial');
    }
    setTrialStarting(null);
  };

  const planIcons = [<Star key="s" className="w-6 h-6" />, <Zap key="z" className="w-6 h-6" />, <Crown key="c" className="w-6 h-6" />];
  const planColors = ['bg-gray-100 text-gray-600', 'bg-blue-100 text-blue-600', 'bg-emerald-100 text-emerald-600'];

  return (
    <div className="space-y-6">
      <div>
        <div className="page-hero">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
        <p className="text-gray-500 text-sm mt-1">Choose the plan that fits your business</p>
        </div>
        </div>
      </div>

      {pendingPayments.length > 0 && (
        <Card className="bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Payment approval pending</p>
              {pendingPayments.map(p => (
                <p key={p._id} className="text-sm text-amber-700 mt-1">
                  {p.plan?.name || 'Plan'} — ₹{p.amount} (submitted {new Date(p.createdAt).toLocaleDateString('en-IN')}). Your payment is under review; the plan will be activated once the admin approves it.
                </p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {currentPlan && (
        <Card className="bg-emerald-50 border border-emerald-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-600 font-medium">Current Plan</p>
              <h3 className="text-xl font-bold text-gray-900">{(currentPlan as Plan).name}</h3>
            </div>
            <Badge variant="success">Active</Badge>
          </div>
        </Card>
      )}

      {autoRenewStatus?.active && (
        <Card className="bg-blue-50 border border-blue-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm text-blue-600 font-medium">Auto-renew is ON</p>
              <p className="text-sm text-gray-700 mt-1">
                {autoRenewStatus.planName} plan renews automatically every {autoRenewStatus.interval === 'yearly' ? 'year' : 'month'}
                {autoRenewStatus.endDate ? ` — next renewal by ${new Date(autoRenewStatus.endDate).toLocaleDateString('en-IN')}` : ''}.
              </p>
            </div>
            <Button variant="outline" onClick={cancelAutoRenewPlan} loading={cancellingAutoRenew}>Cancel Auto-renew</Button>
          </div>
        </Card>
      )}

      {currencies.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Currency</label>
          <select value={selectedCurrency} onChange={e => setSelectedCurrency(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            {currencies.map(c => (
              <option key={c.code} value={c.code.toUpperCase()}>{c.code.toUpperCase()} — {c.name} ({c.symbol})</option>
            ))}
          </select>
          {isForeign && <span className="text-xs text-gray-400">International pricing — auto-renew & coupons apply to {baseCurrency} only.</span>}
        </div>
      )}

      {!isForeign && usableGateways.some(g => g.id === 'razorpay' && g.autoRenewEnabled !== false) && !autoRenewStatus?.active && (
        <label className={`flex items-center gap-2 text-sm cursor-pointer ${couponApplied ? 'text-gray-400' : 'text-gray-700'}`}>
          <input type="checkbox" checked={autoRenew && !couponApplied} disabled={!!couponApplied} onChange={e => setAutoRenew(e.target.checked)} className="rounded" />
          {couponApplied
            ? 'Auto-renew is off while a coupon is applied — you pay once at the discounted price.'
            : 'Enable auto-renew (Razorpay) — plan amount will be charged automatically every billing cycle. Cancel anytime.'}
        </label>
      )}

      {!isForeign && (
      <div className="flex items-center gap-2">
        <input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} placeholder="Have a coupon code?"
          className="border rounded-lg px-3 py-2 text-sm w-52" />
        <Button variant="outline" onClick={applyCouponCode} loading={couponChecking} disabled={!couponCode.trim()}>Apply</Button>
        {couponApplied && (
          <span className="text-sm text-emerald-600 font-medium">
            {couponApplied.code} applied
            <button onClick={() => { setCouponApplied(null); setCouponCode(''); }} className="ml-2 text-gray-400 hover:text-gray-600 underline text-xs">remove</button>
          </span>
        )}
      </div>
      )}

      <div className="flex justify-center">
        <div className="inline-flex items-center bg-gray-100 rounded-xl p-1">
          {(['monthly', 'quarterly', 'yearly'] as const).map(c => (
            <button key={c} onClick={() => setBillingCycle(c)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all ${billingCycle === c ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {c}{c === 'yearly' ? ' -20%' : ''}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center py-8 text-gray-400">Loading plans...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan, idx) => (
            <Card key={plan._id} className={`relative ${(currentPlan as Plan)?._id === plan._id ? 'ring-2 ring-emerald-500' : ''}`}>
              <div className="text-center mb-6">
                <div className={`w-12 h-12 rounded-xl ${planColors[idx % 3]} flex items-center justify-center mx-auto mb-3`}>
                  {planIcons[idx % 3]}
                </div>
                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {plan.price === 0 ? 'Free' : priceLabel(plan)}
                  </span>
                  {plan.price > 0 && <span className="text-gray-500 text-sm">/{cycleSuffix}</span>}
                </div>
              </div>
              <div className="space-y-3 mb-6">
                {Object.entries(plan.limits || {}).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-gray-600">{val === -1 ? 'Unlimited' : val} {key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  </div>
                ))}
                {plan.features && Object.entries(plan.features as unknown as Record<string, boolean>).filter(([, v]) => v).map(([key]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-gray-600">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  </div>
                ))}
              </div>
              {pendingPayments.some(p => p.plan?._id === plan._id) ? (
                <Button className="w-full" variant="outline" disabled>
                  <Clock className="w-4 h-4 mr-2" /> Approval Pending
                </Button>
              ) : (
              <Button className="w-full" variant={(currentPlan as Plan)?._id === plan._id ? 'outline' : 'primary'}
                onClick={() => handleSubscribe(plan._id)}
                loading={subscribing === plan._id}
                disabled={(currentPlan as Plan)?._id === plan._id}>
                {(currentPlan as Plan)?._id === plan._id ? 'Current Plan' : plan.price === 0 ? 'Get Started' : 'Subscribe'}
              </Button>
              )}
              {(() => {
                const trialDays = (plan as unknown as { trialDays?: number }).trialDays || 0;
                const trialMandate = (plan as unknown as { trialRequiresMandate?: boolean }).trialRequiresMandate;
                const trialUsed = (user as unknown as { trialUsed?: boolean })?.trialUsed;
                if (trialDays > 0 && plan.price > 0 && !trialUsed && (currentPlan as Plan)?._id !== plan._id) {
                  return (
                    <>
                      <Button className="w-full mt-2" variant="outline"
                        onClick={() => startTrial(plan._id)}
                        loading={trialStarting === plan._id || subscribing === plan._id}>
                        Start {trialDays}-day Free Trial
                      </Button>
                      {trialMandate && (
                        <p className="text-[11px] text-gray-400 mt-1 text-center">UPI/card required — auto-charges after trial unless cancelled</p>
                      )}
                    </>
                  );
                }
                return null;
              })()}
            </Card>
          ))}
        </div>
      )}
      {gatewayPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setGatewayPlan(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Choose payment method</h3>
            <p className="text-sm text-gray-500 mb-4">{gatewayPlan.name} — {priceLabel(gatewayPlan)}/{cycleSuffix}</p>
            <div className="space-y-2">
              {usableGateways.map(g => (
                <button key={g.id}
                  className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                  onClick={() => { const id = gatewayPlan._id; setGatewayPlan(null); proceedWithGateway(id, g.id); }}>
                  <span className="font-medium text-gray-900">
                    {{ razorpay: 'Razorpay', stripe: 'Stripe', paypal: 'PayPal', phonepe: 'PhonePe', cashfree: 'Cashfree', payu: 'PayU', paystack: 'Paystack', instamojo: 'Instamojo', flutterwave: 'Flutterwave', mollie: 'Mollie', mercadopago: 'Mercado Pago' }[g.id] || 'Manual / UPI / Bank Transfer'}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {g.id === 'manual' ? 'Pay & submit reference — admin approves' : g.id === 'stripe' ? 'Cards — instant activation' : g.id === 'paypal' ? 'PayPal — instant activation' : 'UPI, cards, netbanking — instant activation'}
                  </span>
                </button>
              ))}
            </div>
            <button className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700" onClick={() => setGatewayPlan(null)}>Cancel</button>
          </div>
        </div>
      )}
      <ManualPaymentModal
        isOpen={showManual}
        onClose={() => setShowManual(false)}
        amount={manualPlan ? resolvePrice(manualPlan).amount : 0}
        info={manualInfo}
        submitting={manualSubmitting}
        onConfirm={submitManualSub}
      />
    </div>
  );
}
