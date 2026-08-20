const Payment = require('../models/Payment');
const User = require('../models/User');
const Plan = require('../models/Plan');
const WalletTransaction = require('../models/WalletTransaction');
const paymentService = require('../services/paymentService');

// Records a plan activation in the Subscription collection (shown in Admin → Subscriptions).
const recordSubscription = async (userId, planId, { endDate = null, paymentId = null, notes = '', autoRenew = false, gatewaySubscriptionId = '' } = {}) => {
  try {
    const Subscription = require('../models/Subscription');
    await Subscription.updateMany({ vendor: userId, status: 'active' }, { status: 'expired' });
    await Subscription.create({ vendor: userId, plan: planId, status: 'active', endDate, assignedBy: 'auto', payment: paymentId || undefined, notes, autoRenew, gatewaySubscriptionId });
  } catch (e) { console.error('Subscription record error:', e.message); }
};

// Normalizes a billing cycle value.
const normCycle = (c) => (['monthly', 'quarterly', 'yearly'].includes(c) ? c : 'monthly');

// Price a plan charges for the chosen billing cycle (falls back to derived values
// so plans created before per-cycle pricing still render/charge correctly).
const priceForCycle = (plan, cycle) => {
  if (!plan) return 0;
  const c = normCycle(cycle);
  if (c === 'quarterly') return plan.quarterlyPrice > 0 ? plan.quarterlyPrice : (plan.price || 0) * 3;
  if (c === 'yearly') return plan.yearlyPrice > 0 ? plan.yearlyPrice : (plan.price || 0) * 10;
  return plan.price || 0;
};

// Resolves { amount, currency } to charge for a plan/cycle in the requested
// display currency. Non-base currencies use the plan's manual per-currency price
// (pricingMode 'manual') or base*rate (pricingMode 'exchange'). Unknown/absent or
// unpriced currency falls back to the plan's base price so INR plans are unaffected.
const resolvePlanPrice = (plan, cycle, currencyCode, settings) => {
  const base = priceForCycle(plan, cycle);
  const baseCur = (plan.currency || 'INR').toUpperCase();
  const want = String(currencyCode || '').toUpperCase();
  if (!want || want === baseCur) return { amount: base, currency: baseCur };
  const cur = ((settings && settings.currencies) || []).find(
    (c) => (c.code || '').toUpperCase() === want && c.isActive !== false
  );
  if (!cur) return { amount: base, currency: baseCur };
  if ((plan.pricingMode || 'manual') === 'exchange') {
    const rate = Number(cur.rate) > 0 ? Number(cur.rate) : 0;
    return rate ? { amount: Math.round(base * rate), currency: want } : { amount: base, currency: baseCur };
  }
  const row = (plan.prices || []).find((p) => (p.currency || '').toUpperCase() === want);
  const amt = row ? Number(row[normCycle(cycle)] || 0) : 0;
  return amt > 0 ? { amount: amt, currency: want } : { amount: base, currency: baseCur };
};

// True when the admin enabled the given gateway for non-base (foreign) currency.
const gatewayAllowsIntl = (settings, gateway) => !!(((settings && settings.gatewayInternational) || {})[gateway]);

const CYCLE_DAYS = { monthly: 30, quarterly: 90, yearly: 365 };

// Expiry date for a paid plan based on the chosen billing cycle (null = lifetime).
const planEndDate = (plan, cycle) => {
  if (!plan || plan.price <= 0 || plan.interval === 'lifetime') return null;
  return new Date(Date.now() + CYCLE_DAYS[normCycle(cycle)] * 24 * 60 * 60 * 1000);
};

// True if a coupon can be used for the given plan. Empty applicablePlans = all plans.
const couponAppliesToPlan = (coupon, planId) => {
  const list = Array.isArray(coupon.applicablePlans) ? coupon.applicablePlans : [];
  if (list.length === 0) return true;
  return list.some((p) => String(p) === String(planId));
};

// Validates a coupon code and returns { coupon, price } for the given plan.
const applyCoupon = async (couponCode, planPrice, planId) => {
  if (!couponCode) return { coupon: null, price: planPrice };
  const Coupon = require('../models/Coupon');
  const coupon = await Coupon.findOne({ code: String(couponCode).trim().toUpperCase(), isActive: true });
  if (!coupon) throw new Error('Invalid coupon code');
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new Error('This coupon has expired');
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its usage limit');
  if (planId && !couponAppliesToPlan(coupon, planId)) throw new Error('This coupon is not valid for the selected plan');
  const discount = coupon.discountType === 'percent'
    ? Math.round((planPrice * coupon.discountValue) / 100)
    : Math.min(coupon.discountValue, planPrice);
  return { coupon, price: Math.max(0, planPrice - discount) };
};

// Gateways where the client pays on the provider's hosted page and we verify
// the payment status server-side when they return.
const HOSTED_GATEWAYS = ['phonepe', 'cashfree', 'payu', 'paypal', 'paystack', 'instamojo', 'flutterwave', 'mollie', 'mercadopago'];

// Maps SystemSettings.paymentGateways config to the shape gatewayLinks expects.
const hostedGatewayConfig = (pg, id) => {
  if (id === 'phonepe') return { merchantId: pg.phonepe?.publicKey, apiSecret: pg.phonepe?.secretKey };
  if (id === 'cashfree') return { clientId: pg.cashfree?.publicKey, apiSecret: pg.cashfree?.secretKey };
  if (id === 'payu') return { merchantKey: pg.payu?.publicKey, merchantSalt: pg.payu?.secretKey, mode: pg.payu?.mode || 'live' };
  if (id === 'paypal') return { clientId: pg.paypal?.clientId, apiSecret: pg.paypal?.clientSecret };
  if (id === 'paystack') return { apiKey: pg.paystack?.secretKey };
  if (id === 'instamojo') return { apiKey: pg.instamojo?.publicKey, authToken: pg.instamojo?.secretKey };
  if (id === 'flutterwave') return { apiKey: pg.flutterwave?.secretKey };
  if (id === 'mollie') return { apiKey: pg.mollie?.secretKey };
  if (id === 'mercadopago') return { apiKey: pg.mercadopago?.secretKey };
  return null;
};

const hostedGatewayConfigured = (pg, id) => {
  const cfg = hostedGatewayConfig(pg, id) || {};
  return Object.values(cfg).every((v) => !!v);
};

// @POST /api/payments/subscribe
const subscribe = async (req, res) => {
  try {
    const { planId, gateway, couponCode } = req.body;
    const cycle = normCycle(req.body.cycle);
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const baseCurrency = (plan.currency || 'INR').toUpperCase();
    const reqCurrency = String(req.body.currency || '').toUpperCase();
    const isForeign = !!reqCurrency && reqCurrency !== baseCurrency;
    // Load settings once only when a foreign currency is requested (FX rate +
    // per-gateway international gating). The INR flow issues no extra query.
    const curSettings = isForeign ? await require('../models/SystemSettings').findOne() : null;
    const resolved = resolvePlanPrice(plan, cycle, reqCurrency, curSettings);
    const chargeCurrency = resolved.currency;
    const basePrice = resolved.amount;
    if (chargeCurrency !== baseCurrency) {
      // Foreign currency guardrails: only admin-enabled international gateways,
      // no auto-renew (per-cycle gateway plan ids can't mix currencies), no coupons.
      if (!gatewayAllowsIntl(curSettings, gateway)) {
        return res.status(400).json({ success: false, message: `${gateway} is not enabled for international (${chargeCurrency}) payments. Ask admin to enable it in Payment Gateways.` });
      }
      if (req.body.autoRenew) {
        return res.status(400).json({ success: false, message: 'Auto-renew is available in the base currency only. Please pay without auto-renew for international currency.' });
      }
      if (couponCode) {
        return res.status(400).json({ success: false, message: 'Coupons apply to base-currency payments only.' });
      }
    }
    let coupon = null;
    let price = basePrice;
    if (basePrice > 0 && couponCode) {
      try { ({ coupon, price } = await applyCoupon(couponCode, basePrice, plan._id)); }
      catch (e) { return res.status(400).json({ success: false, message: e.message }); }
    }
    const couponNote = coupon ? ` (coupon ${coupon.code})` : '';

    if (price === 0 && basePrice > 0) {
      // Coupon covers full amount - activate directly
      const couponEnd = planEndDate(plan, cycle);
      req.user.plan = plan._id;
      req.user.planExpiry = couponEnd;
      await req.user.save();
      coupon.usedCount += 1; await coupon.save();
      const payment = await Payment.create({
        user: req.user._id, plan: plan._id, amount: 0, currency: plan.currency || 'INR',
        gateway: 'manual', type: 'subscription', status: 'completed',
        description: `Plan activated with 100% discount${couponNote}`,
        metadata: { cycle },
      });
      await recordSubscription(req.user._id, plan._id, { endDate: couponEnd, paymentId: payment._id, notes: `Coupon ${coupon.code} (${cycle})` });
      return res.json({ success: true, message: 'Plan activated with coupon', data: { plan } });
    }

    if (plan.price === 0) {
      // Free plan - direct assign
      req.user.plan = plan._id;
      req.user.planExpiry = null;
      await req.user.save();
      await recordSubscription(req.user._id, plan._id, { notes: 'Free plan' });
      return res.json({ success: true, message: 'Free plan activated', data: { plan } });
    }

    if (gateway === 'razorpay') {
      const SystemSettings = require('../models/SystemSettings');
      const settings = await SystemSettings.findOne();
      const rzCfg = settings?.paymentGateways?.razorpay || {};
      if (!rzCfg.keyId || !rzCfg.keySecret) {
        return res.status(400).json({ success: false, message: 'Razorpay is not configured. Ask admin to add Razorpay keys in Payment Gateways, or use Manual payment.' });
      }
      const rz = paymentService.getRazorpay(rzCfg.keyId, rzCfg.keySecret);

      if (req.body.autoRenew) {
        if (rzCfg.autoRenewEnabled === false) {
          return res.status(400).json({ success: false, message: 'Auto-renew (e-mandate) is disabled by admin. Pay without auto-renew.' });
        }
        if (coupon) return res.status(400).json({ success: false, message: 'Coupons cannot be combined with auto-renew. Remove the coupon or pay without auto-renew.' });
        const gpIds = plan.gatewayPlanIds && typeof plan.gatewayPlanIds === 'object' ? { ...plan.gatewayPlanIds } : {};
        // Razorpay plans are immutable: their amount is fixed at creation. If the
        // admin later changes the plan price, the stored plan id still charges the
        // OLD amount. So verify the stored plan's amount/currency still matches the
        // current price; if it changed (or the plan is missing), create a fresh one.
        const wantAmount = Math.round(basePrice * 100);
        const wantCurrency = String(plan.currency || 'INR').toUpperCase();
        let needNewPlan = !gpIds[cycle];
        if (gpIds[cycle]) {
          try {
            const existingRzPlan = await rz.plans.fetch(gpIds[cycle]);
            const exAmount = Number(existingRzPlan?.item?.amount || 0);
            const exCurrency = String(existingRzPlan?.item?.currency || '').toUpperCase();
            if (exAmount !== wantAmount || exCurrency !== wantCurrency) needNewPlan = true;
          } catch (e) {
            needNewPlan = true;
          }
        }
        if (needNewPlan) {
          const rzPlan = await rz.plans.create({
            period: cycle === 'yearly' ? 'yearly' : 'monthly',
            interval: cycle === 'quarterly' ? 3 : 1,
            item: { name: `${settings?.appName || 'WabaPanel'} ${plan.name} (${cycle})`, amount: wantAmount, currency: plan.currency || 'INR' },
          });
          gpIds[cycle] = rzPlan.id;
          plan.gatewayPlanIds = gpIds;
          plan.markModified('gatewayPlanIds');
          await plan.save();
        }
        const useTrialMandate = plan.trialRequiresMandate && plan.trialDays > 0 && !req.user.trialUsed;
        const totalCount = cycle === 'yearly' ? 10 : cycle === 'quarterly' ? 20 : 60;
        const rzSub = await rz.subscriptions.create({
          plan_id: gpIds[cycle],
          total_count: totalCount,
          customer_notify: 1,
          ...(useTrialMandate ? { start_at: Math.floor(Date.now() / 1000) + plan.trialDays * 24 * 60 * 60 } : {}),
          notes: { type: 'plan', planId: plan._id.toString(), userId: req.user._id.toString(), cycle },
        });
        const payment = await Payment.create({
          user: req.user._id, plan: plan._id, amount: useTrialMandate ? 0 : basePrice, currency: plan.currency || 'INR',
          gateway: 'razorpay', gatewaySubscriptionId: rzSub.id, type: 'subscription', status: 'pending',
          description: useTrialMandate ? `${plan.trialDays}-day trial with auto-renew mandate` : 'Plan subscription (auto-renew)',
          metadata: { autoRenew: true, cycle, ...(useTrialMandate ? { trialDays: plan.trialDays } : {}) },
        });
        return res.json({
          success: true,
          data: { subscriptionId: rzSub.id, paymentId: payment._id, keyId: rzCfg.keyId, autoRenew: true, trialDays: useTrialMandate ? plan.trialDays : 0 },
        });
      }

      const order = await paymentService.createRazorpayOrder(rz, {
        amount: price,
        currency: chargeCurrency,
        receipt: `plan_${plan._id}_${req.user._id}`,
        notes: { planId: plan._id.toString(), userId: req.user._id.toString() },
      });

      const payment = await Payment.create({
        user: req.user._id,
        plan: plan._id,
        amount: price,
        currency: chargeCurrency,
        gateway: 'razorpay',
        gatewayOrderId: order.id,
        type: 'subscription',
        status: 'pending',
        description: coupon ? `Plan subscription${couponNote}` : undefined,
        metadata: { cycle, ...(coupon ? { couponCode: coupon.code } : {}) },
      });

      return res.json({
        success: true,
        data: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          paymentId: payment._id,
          keyId: settings.paymentGateways.razorpay.keyId,
        },
      });
    }

    if (gateway === 'stripe') {
      const SystemSettings = require('../models/SystemSettings');
      const settings = await SystemSettings.findOne();
      const st = paymentService.getStripe(settings.paymentGateways.stripe.secretKey);

      const session = await paymentService.createStripeCheckout(st, {
        priceId: plan.stripePriceId,
        successUrl: `${process.env.FRONTEND_URL}/billing?success=true`,
        cancelUrl: `${process.env.FRONTEND_URL}/billing?cancelled=true`,
        metadata: { planId: plan._id.toString(), userId: req.user._id.toString(), cycle },
      });

      const payment = await Payment.create({
        user: req.user._id,
        plan: plan._id,
        amount: basePrice,
        gateway: 'stripe',
        gatewayPaymentId: session.id,
        type: 'subscription',
        status: 'pending',
        metadata: { cycle },
      });

      return res.json({ success: true, data: { sessionUrl: session.url, paymentId: payment._id } });
    }

    if (HOSTED_GATEWAYS.includes(gateway)) {
      const SystemSettings = require('../models/SystemSettings');
      const settings = await SystemSettings.findOne();
      const pg = settings?.paymentGateways || {};
      if (!pg[gateway]?.isActive || !hostedGatewayConfigured(pg, gateway)) {
        return res.status(400).json({ success: false, message: `${gateway} is not configured. Ask admin to add its keys in Payment Gateways.` });
      }
      const payment = await Payment.create({
        user: req.user._id,
        plan: plan._id,
        amount: price,
        currency: chargeCurrency,
        gateway,
        type: 'subscription',
        status: 'pending',
        description: `${plan.name} plan via ${gateway}` + couponNote,
        metadata: { cycle, ...(coupon ? { couponCode: coupon.code } : {}) },
      });
      const { createGatewayLink } = require('../services/gatewayLinks');
      const returnUrl = `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/client/subscriptions?hostedPayment=${payment._id}`;
      try {
        const { link, externalId } = await createGatewayLink(gateway, hostedGatewayConfig(pg, gateway), {
          amount: price, currency: chargeCurrency,
          description: `${plan.name} plan`,
          customer: { name: req.user.name, email: req.user.email, phone: req.user.phone },
          redirectUrl: returnUrl,
        });
        payment.gatewayOrderId = externalId;
        await payment.save();
        return res.json({ success: true, data: { sessionUrl: link, paymentId: payment._id } });
      } catch (e) {
        payment.status = 'failed';
        await payment.save();
        return res.status(400).json({ success: false, message: e.response?.data?.message || e.message || `Could not start ${gateway} payment` });
      }
    }

    if (gateway === 'manual') {
      const payment = await Payment.create({
        user: req.user._id,
        plan: plan._id,
        amount: price,
        currency: chargeCurrency,
        gateway: 'manual',
        type: 'subscription',
        status: 'pending',
        description: (req.body.description || 'Manual payment request') + couponNote,
        manualReference: req.body.reference || '',
        manualProofUrl: req.body.proofUrl || '',
        metadata: { cycle, ...(coupon ? { couponCode: coupon.code } : {}) },
      });
      require('../services/adminNotify').notifyAdmin('Manual payment approval pending', ['User: ' + (req.user.name || '') + ' (' + req.user.email + ')', 'Plan: ' + plan.name + ' — ₹' + price, 'Reference: ' + (req.body.reference || '-')], '/admin/payments').catch(() => {});
      return res.json({ success: true, message: 'Manual payment request submitted', data: payment });
    }

    return res.status(400).json({ success: false, message: 'Invalid payment gateway' });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.error?.description || error.message || 'Payment could not be started' });
  }
};

// @POST /api/payments/start-trial
const startTrial = async (req, res) => {
  try {
    const plan = await Plan.findById(req.body.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    if (!plan.trialDays || plan.trialDays <= 0) return res.status(400).json({ success: false, message: 'This plan does not offer a free trial' });
    if (req.user.trialUsed) return res.status(400).json({ success: false, message: 'You have already used your free trial' });
    if (plan.trialRequiresMandate) {
      // A mandate can only be collected via an auto-renew capable online gateway (Razorpay/Stripe).
      // If none is configured on this panel, there is no way to take the mandate — fall back to a
      // plain free trial so the button still works (no auto-charge after the trial).
      const SystemSettings = require('../models/SystemSettings');
      const settings = await SystemSettings.findOne();
      const pg = settings?.paymentGateways || {};
      const rzMandate = !!(pg.razorpay?.keyId && pg.razorpay?.keySecret && pg.razorpay?.isActive !== false && pg.razorpay?.autoRenewEnabled !== false);
      const stripeMandate = !!(pg.stripe?.secretKey && pg.stripe?.isActive !== false);
      if (rzMandate || stripeMandate) {
        return res.status(400).json({ success: false, message: 'This trial requires a payment method. Subscribe with auto-renew to start your free trial.', data: { requiresMandate: true } });
      }
      // else: no gateway configured -> continue below and start a plain trial
    }
    req.user.plan = plan._id;
    req.user.planExpiry = new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000);
    req.user.trialUsed = true;
    await req.user.save();
    await recordSubscription(req.user._id, plan._id, { endDate: req.user.planExpiry, notes: `${plan.trialDays}-day free trial` });
    res.json({ success: true, message: `${plan.trialDays}-day free trial of ${plan.name} activated`, data: { plan, expiresAt: req.user.planExpiry } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// @POST /api/payments/verify
const verifyPayment = async (req, res) => {
  try {
    const { paymentId, razorpay_payment_id, razorpay_order_id, razorpay_subscription_id, razorpay_signature } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Payment already processed' });
    }

    if (payment.gateway === 'razorpay') {
      const SystemSettings = require('../models/SystemSettings');
      const settings = await SystemSettings.findOne();
      const rz = paymentService.getRazorpay(
        settings.paymentGateways.razorpay.keyId,
        settings.paymentGateways.razorpay.keySecret
      );

      const isValid = razorpay_subscription_id
        ? paymentService.verifyRazorpaySubscription({
            subscriptionId: razorpay_subscription_id,
            paymentId: razorpay_payment_id,
            signature: razorpay_signature,
            keySecret: settings.paymentGateways.razorpay.keySecret,
          })
        : await paymentService.verifyRazorpayPayment(rz, {
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            signature: razorpay_signature,
            keySecret: settings.paymentGateways.razorpay.keySecret,
          });

      if (!isValid) {
        payment.status = 'failed';
        await payment.save();
        return res.status(400).json({ success: false, message: 'Payment verification failed' });
      }

      payment.status = 'completed';
      payment.gatewayPaymentId = razorpay_payment_id;
      await payment.save();

      // Activate plan
      const user = await User.findById(payment.user);
      const paidPlan = await Plan.findById(payment.plan);
      const trialDays = Number(payment.metadata?.trialDays) || 0;
      const paidEnd = trialDays > 0
        ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
        : planEndDate(paidPlan, payment.metadata?.cycle);
      user.plan = payment.plan;
      user.planExpiry = paidEnd;
      if (trialDays > 0) user.trialUsed = true;
      await user.save();
      await recordSubscription(user._id, payment.plan, {
        endDate: paidEnd, paymentId: payment._id,
        notes: trialDays > 0
          ? `${trialDays}-day trial (auto-renew mandate)`
          : razorpay_subscription_id ? 'Razorpay payment (auto-renew)' : 'Razorpay payment',
        autoRenew: !!razorpay_subscription_id,
        gatewaySubscriptionId: razorpay_subscription_id || '',
      });
      if (payment.metadata?.couponCode) {
        const Coupon = require('../models/Coupon');
        await Coupon.updateOne({ code: payment.metadata.couponCode }, { $inc: { usedCount: 1 } });
      }

      return res.json({ success: true, message: 'Payment verified and plan activated' });
    }

    return res.status(400).json({ success: false, message: 'Unsupported gateway' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/payments/wallet/topup
const walletTopup = async (req, res) => {
  try {
    const { amount, gateway } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne();

    if (gateway === 'razorpay') {
      const rzCfg = settings?.paymentGateways?.razorpay || {};
      if (!rzCfg.keyId || !rzCfg.keySecret) {
        return res.status(400).json({ success: false, message: 'Razorpay is not configured. Ask admin to add Razorpay keys in Payment Gateways, or use Manual payment.' });
      }
      const rz = paymentService.getRazorpay(rzCfg.keyId, rzCfg.keySecret);

      if (req.body.autoRenew) {
        if (rzCfg.autoRenewEnabled === false) {
          return res.status(400).json({ success: false, message: 'Auto top-up (e-mandate) is disabled by admin.' });
        }
        if (req.user.walletAutoTopup?.active) {
          return res.status(400).json({ success: false, message: 'Auto top-up is already active. Cancel it first to change the amount.' });
        }
        // Reuse an existing Razorpay plan for this amount instead of creating a new one each time.
        const amtKey = String(Math.round(amount * 100));
        const wpIds = settings.walletTopupPlanIds && typeof settings.walletTopupPlanIds === 'object' ? { ...settings.walletTopupPlanIds } : {};
        let walletPlanId = wpIds[amtKey];
        if (!walletPlanId) {
          const rzPlan = await rz.plans.create({
            period: 'monthly',
            interval: 1,
            item: { name: `${settings?.appName || 'WabaPanel'} Wallet Top-up ₹${amount}`, amount: Math.round(amount * 100), currency: 'INR' },
          });
          walletPlanId = rzPlan.id;
          wpIds[amtKey] = walletPlanId;
          settings.walletTopupPlanIds = wpIds;
          settings.markModified('walletTopupPlanIds');
          await settings.save();
        }
        const rzSub = await rz.subscriptions.create({
          plan_id: walletPlanId,
          total_count: 60,
          customer_notify: 1,
          notes: { type: 'wallet_topup', userId: req.user._id.toString() },
        });
        const payment = await Payment.create({
          user: req.user._id, amount, gateway: 'razorpay', gatewaySubscriptionId: rzSub.id,
          type: 'wallet_topup', status: 'pending',
          description: 'Monthly auto wallet top-up', metadata: { autoRenew: true },
        });
        return res.json({
          success: true,
          data: { subscriptionId: rzSub.id, paymentId: payment._id, keyId: rzCfg.keyId, autoRenew: true },
        });
      }

      const order = await paymentService.createRazorpayOrder(rz, {
        amount,
        currency: 'INR',
        receipt: `wallet_${req.user._id}_${Date.now()}`,
        notes: { type: 'wallet_topup', userId: req.user._id.toString() },
      });

      const payment = await Payment.create({
        user: req.user._id,
        amount,
        gateway: 'razorpay',
        gatewayOrderId: order.id,
        type: 'wallet_topup',
        status: 'pending',
      });

      return res.json({
        success: true,
        data: {
          orderId: order.id,
          amount: order.amount,
          paymentId: payment._id,
          keyId: rzCfg.keyId,
        },
      });
    }

    if (HOSTED_GATEWAYS.includes(gateway)) {
      const pg = settings?.paymentGateways || {};
      if (!pg[gateway]?.isActive || !hostedGatewayConfigured(pg, gateway)) {
        return res.status(400).json({ success: false, message: `${gateway} is not configured. Ask admin to add its keys in Payment Gateways.` });
      }
      const payment = await Payment.create({
        user: req.user._id,
        amount,
        gateway,
        type: 'wallet_topup',
        status: 'pending',
        description: `Wallet top-up via ${gateway}`,
      });
      const { createGatewayLink } = require('../services/gatewayLinks');
      const returnUrl = `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/client/billing?hostedPayment=${payment._id}`;
      try {
        const { link, externalId } = await createGatewayLink(gateway, hostedGatewayConfig(pg, gateway), {
          amount, currency: 'INR',
          description: 'Wallet top-up',
          customer: { name: req.user.name, email: req.user.email, phone: req.user.phone },
          redirectUrl: returnUrl,
        });
        payment.gatewayOrderId = externalId;
        await payment.save();
        return res.json({ success: true, data: { sessionUrl: link, paymentId: payment._id } });
      } catch (e) {
        payment.status = 'failed';
        await payment.save();
        return res.status(400).json({ success: false, message: e.response?.data?.message || e.message || `Could not start ${gateway} payment` });
      }
    }

    if (gateway === 'manual') {
      const payment = await Payment.create({
        user: req.user._id,
        amount,
        gateway: 'manual',
        type: 'wallet_topup',
        status: 'pending',
        description: req.body.description || 'Manual wallet top-up request',
        manualReference: req.body.reference || '',
        manualProofUrl: req.body.proofUrl || '',
      });
      return res.json({ success: true, message: 'Manual top-up request submitted. Admin will confirm and credit your wallet.', data: payment });
    }

    return res.status(400).json({ success: false, message: 'Invalid gateway for wallet topup' });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.error?.description || error.message || 'Payment could not be started' });
  }
};

// @POST /api/payments/wallet/verify
const verifyWalletTopup = async (req, res) => {
  try {
    const { paymentId, razorpay_payment_id, razorpay_order_id, razorpay_subscription_id, razorpay_signature } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Payment already processed' });
    }

    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne();
    const rz = paymentService.getRazorpay(
      settings.paymentGateways.razorpay.keyId,
      settings.paymentGateways.razorpay.keySecret
    );

    const isValid = razorpay_subscription_id
      ? paymentService.verifyRazorpaySubscription({
          subscriptionId: razorpay_subscription_id,
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
          keySecret: settings.paymentGateways.razorpay.keySecret,
        })
      : await paymentService.verifyRazorpayPayment(rz, {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
          keySecret: settings.paymentGateways.razorpay.keySecret,
        });

    if (!isValid) {
      payment.status = 'failed';
      await payment.save();
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    payment.status = 'completed';
    payment.gatewayPaymentId = razorpay_payment_id;
    await payment.save();

    // Credit wallet
    const user = await User.findById(payment.user);
    user.walletBalance += payment.amount;
    await user.save();

    await WalletTransaction.create({
      user: user._id,
      type: 'credit',
      amount: payment.amount,
      balanceAfter: user.walletBalance,
      description: razorpay_subscription_id ? 'Wallet auto top-up via Razorpay' : 'Wallet top-up via Razorpay',
      category: 'topup',
      reference: payment._id.toString(),
    });

    if (razorpay_subscription_id) {
      user.walletAutoTopup = { active: true, amount: payment.amount, gatewaySubscriptionId: razorpay_subscription_id };
      await user.save();
    }

    res.json({ success: true, data: { balance: user.walletBalance } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/payments/hosted/verify — confirm a hosted-checkout payment
// (PhonePe / Cashfree / PayPal) after the client returns from the gateway,
// then activate the plan or credit the wallet.
const verifyHostedPayment = async (req, res) => {
  try {
    const { paymentId } = req.body;
    const payment = await Payment.findOne({ _id: paymentId, user: req.user._id });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (!HOSTED_GATEWAYS.includes(payment.gateway)) {
      return res.status(400).json({ success: false, message: 'Unsupported gateway' });
    }
    if (payment.status === 'completed') {
      return res.json({ success: true, message: 'Payment already confirmed', data: { status: 'completed' } });
    }

    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne();
    const pg = settings?.paymentGateways || {};
    const { checkGatewayPayment } = require('../services/gatewayLinks');
    const result = await checkGatewayPayment(payment.gateway, hostedGatewayConfig(pg, payment.gateway), payment.gatewayOrderId);

    if (!result.paid) {
      return res.json({ success: true, data: { status: 'pending' }, message: 'Payment not completed yet. If you already paid, it may take a minute — try again shortly.' });
    }

    payment.status = 'completed';
    payment.gatewayPaymentId = result.gatewayPaymentId || payment.gatewayOrderId;
    await payment.save();

    const user = await User.findById(payment.user);

    if (payment.type === 'wallet_topup') {
      user.walletBalance += payment.amount;
      await user.save();
      await WalletTransaction.create({
        user: user._id,
        type: 'credit',
        amount: payment.amount,
        balanceAfter: user.walletBalance,
        description: `Wallet top-up via ${payment.gateway}`,
        category: 'topup',
        reference: payment._id.toString(),
      });
      return res.json({ success: true, message: 'Wallet credited', data: { status: 'completed', balance: user.walletBalance } });
    }

    // Subscription payment — activate the plan
    const paidPlan = await Plan.findById(payment.plan);
    const paidEnd = planEndDate(paidPlan, payment.metadata?.cycle);
    user.plan = payment.plan;
    user.planExpiry = paidEnd;
    await user.save();
    await recordSubscription(user._id, payment.plan, {
      endDate: paidEnd, paymentId: payment._id,
      notes: `${payment.gateway} payment`,
    });
    if (payment.metadata?.couponCode) {
      const Coupon = require('../models/Coupon');
      await Coupon.updateOne({ code: payment.metadata.couponCode }, { $inc: { usedCount: 1 } });
    }
    return res.json({ success: true, message: 'Payment verified and plan activated', data: { status: 'completed' } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data?.message || error.message });
  }
};

// @GET /api/payments/plans
const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ status: 'active' }).sort('price');
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/payments/order (alias for subscribe)
const createOrder = async (req, res) => {
  return subscribe(req, res);
};

// @GET /api/payments/auto-renew
const getAutoRenewStatus = async (req, res) => {
  try {
    const Subscription = require('../models/Subscription');
    const sub = await Subscription.findOne({ vendor: req.user._id, status: 'active', autoRenew: true, gatewaySubscriptionId: { $ne: '' } })
      .populate('plan', 'name price interval');
    res.json({
      success: true,
      data: {
        plan: sub ? { active: true, planName: sub.plan?.name, interval: sub.plan?.interval, endDate: sub.endDate } : { active: false },
        wallet: req.user.walletAutoTopup?.active
          ? { active: true, amount: req.user.walletAutoTopup.amount }
          : { active: false },
      },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// @POST /api/payments/auto-renew/cancel  { type: 'plan' | 'wallet' }
const cancelAutoRenew = async (req, res) => {
  try {
    const { type } = req.body;
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne();
    const rzCfg = settings?.paymentGateways?.razorpay || {};
    const rz = paymentService.getRazorpay(rzCfg.keyId, rzCfg.keySecret);

    if (type === 'wallet') {
      const at = req.user.walletAutoTopup;
      if (!at?.active || !at.gatewaySubscriptionId) {
        return res.status(400).json({ success: false, message: 'No active auto top-up found' });
      }
      try { await rz.subscriptions.cancel(at.gatewaySubscriptionId, false); }
      catch (e) { if (!/already cancelled|not cancellable/i.test(e?.error?.description || '')) throw e; }
      req.user.walletAutoTopup = { active: false, amount: 0, gatewaySubscriptionId: '' };
      await req.user.save();
      return res.json({ success: true, message: 'Auto top-up cancelled' });
    }

    const Subscription = require('../models/Subscription');
    const sub = await Subscription.findOne({ vendor: req.user._id, status: 'active', autoRenew: true, gatewaySubscriptionId: { $ne: '' } });
    if (!sub) return res.status(400).json({ success: false, message: 'No active auto-renew subscription found' });
    try { await rz.subscriptions.cancel(sub.gatewaySubscriptionId, true); }
    catch (e) { if (!/already cancelled|not cancellable/i.test(e?.error?.description || '')) throw e; }
    sub.autoRenew = false;
    sub.notes = (sub.notes ? sub.notes + ' | ' : '') + 'Auto-renew cancelled by user';
    await sub.save();
    res.json({ success: true, message: 'Auto-renew cancelled. Your plan stays active till its expiry date.' });
  } catch (e) { res.status(500).json({ success: false, message: e?.error?.description || e.message }); }
};

// @GET /api/payments/wallet/history (alias for wallet/transactions)
const getWalletHistory = async (req, res) => {
  try {
    const transactions = await WalletTransaction.find({ user: req.user._id }).sort('-createdAt');
    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/payments/history
const getPaymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id })
      .populate('plan', 'name price')
      .sort('-createdAt');
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/payments/history/:id
const deletePaymentHistory = async (req, res) => {
  try {
    const payment = await Payment.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/payments/wallet/transactions
const getWalletTransactions = async (req, res) => {
  try {
    const transactions = await WalletTransaction.find({ user: req.user._id }).sort('-createdAt');
    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/payments/invoice/:id  -> streams a PDF invoice for a payment
const downloadInvoice = async (req, res) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, user: req.user._id }).populate('plan', 'name');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Invoice available only for completed payments' });
    }
    const { buildPlanInvoicePdf } = require('../services/planInvoicePdf');
    const built = await buildPlanInvoicePdf(payment);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${built.invoiceNo}.pdf"`);
    res.send(built.buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// @GET /api/payments/gateways - enabled gateways for clients (no secrets)
const getEnabledGateways = async (req, res) => {
  try {
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne();
    const pg = settings?.paymentGateways || {};
    const isConfigured = (id) => {
      if (id === 'razorpay') return !!(pg.razorpay?.keyId && pg.razorpay?.keySecret);
      if (id === 'stripe') return !!pg.stripe?.secretKey;
      if (HOSTED_GATEWAYS.includes(id)) return hostedGatewayConfigured(pg, id);
      return true; // manual needs no keys here
    };
    const baseCurrency = ((settings?.currencies || []).find((c) => c.isDefault)?.code || 'INR').toUpperCase();
    const wantCurrency = String(req.query.currency || '').toUpperCase();
    const isForeign = !!wantCurrency && wantCurrency !== baseCurrency;
    const gateways = ['razorpay', 'stripe', 'manual', 'paypal', 'phonepe', 'cashfree', 'payu', 'paystack', 'instamojo', 'flutterwave', 'mollie', 'mercadopago']
      .filter((id) => pg[id]?.isActive)
      // Foreign currency: show only gateways the admin enabled for international.
      .filter((id) => !isForeign || gatewayAllowsIntl(settings, id))
      .map((id) => ({ id, configured: isConfigured(id), allowInternational: gatewayAllowsIntl(settings, id), ...(id === 'razorpay' ? { autoRenewEnabled: pg.razorpay?.autoRenewEnabled !== false } : {}), ...(id === 'manual' ? { upiId: pg.manual?.upiId || '', qrImageUrl: pg.manual?.qrImageUrl || '', accountDetails: pg.manual?.accountDetails || '', instructions: pg.manual?.instructions || '' } : {}) }));
    res.json({ success: true, data: gateways });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/payments/currencies - active sale currencies for the checkout selector
const getClientCurrencies = async (req, res) => {
  try {
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne();
    const list = (settings?.currencies || [])
      .filter((c) => c.isActive !== false && c.code)
      .map((c) => ({ code: (c.code || '').toUpperCase(), name: c.name || '', symbol: c.symbol || '', rate: Number(c.rate) || 0, isDefault: !!c.isDefault }));
    const base = list.find((c) => c.isDefault)?.code || 'INR';
    res.json({ success: true, data: { currencies: list, baseCurrency: base } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  subscribe, startTrial, verifyPayment, walletTopup, verifyWalletTopup, verifyHostedPayment,
  getPaymentHistory, getWalletTransactions, getPlans, createOrder, getWalletHistory,
  downloadInvoice, getEnabledGateways, getAutoRenewStatus, cancelAutoRenew, getClientCurrencies,
  deletePaymentHistory,
};
