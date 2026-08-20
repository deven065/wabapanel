const stripe = require('stripe');
const Razorpay = require('razorpay');

class PaymentService {
  getStripe(secretKey) {
    return stripe(secretKey || process.env.STRIPE_SECRET_KEY);
  }

  getRazorpay(keyId, keySecret) {
    return new Razorpay({
      key_id: keyId || process.env.RAZORPAY_KEY_ID,
      key_secret: keySecret || process.env.RAZORPAY_KEY_SECRET,
    });
  }

  // Stripe methods
  async createStripeCheckout(stripeInstance, { priceId, customerId, successUrl, cancelUrl, metadata }) {
    return stripeInstance.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });
  }

  async createStripeCustomer(stripeInstance, { email, name }) {
    return stripeInstance.customers.create({ email, name });
  }

  async cancelStripeSubscription(stripeInstance, subscriptionId) {
    return stripeInstance.subscriptions.cancel(subscriptionId);
  }

  // Razorpay methods
  async createRazorpayOrder(razorpayInstance, { amount, currency, receipt, notes }) {
    return razorpayInstance.orders.create({
      amount: amount * 100, // Razorpay expects paise
      currency: currency || 'INR',
      receipt: String(receipt || '').slice(0, 40), // Razorpay allows max 40 chars
      notes,
    });
  }

  async createRazorpaySubscription(razorpayInstance, { planId, totalCount, customerId, notes }) {
    return razorpayInstance.subscriptions.create({
      plan_id: planId,
      total_count: totalCount || 12,
      customer_id: customerId,
      notes,
    });
  }

  async verifyRazorpayPayment(razorpayInstance, { orderId, paymentId, signature, keySecret }) {
    const crypto = require('crypto');
    const secret = keySecret || razorpayInstance?.key_secret || process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return false;
    const generated = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return generated === signature;
  }

  verifyRazorpaySubscription({ subscriptionId, paymentId, signature, keySecret }) {
    const crypto = require('crypto');
    const secret = keySecret || process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return false;
    const generated = crypto
      .createHmac('sha256', secret)
      .update(`${paymentId}|${subscriptionId}`)
      .digest('hex');
    return generated === signature;
  }

  // Wallet top-up
  async createWalletTopupOrder(gateway, amount, userId, gatewayConfig) {
    if (gateway === 'razorpay') {
      const rz = this.getRazorpay(gatewayConfig.keyId, gatewayConfig.keySecret);
      return this.createRazorpayOrder(rz, {
        amount,
        currency: 'INR',
        receipt: `wallet_${userId}_${Date.now()}`,
        notes: { type: 'wallet_topup', userId },
      });
    }

    if (gateway === 'stripe') {
      const st = this.getStripe(gatewayConfig.secretKey);
      return st.paymentIntents.create({
        amount: amount * 100,
        currency: 'inr',
        metadata: { type: 'wallet_topup', userId },
      });
    }

    throw new Error('Unsupported gateway');
  }
}

module.exports = new PaymentService();
