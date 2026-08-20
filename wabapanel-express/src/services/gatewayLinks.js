const axios = require('axios');
const crypto = require('crypto');

const APP_URL = (process.env.FRONTEND_URL || 'https://app.wabapanel.com').replace(/\/$/, '');

// Creates a hosted payment link on the vendor's connected gateway.
// Returns { link, externalId }.
const createGatewayLink = async (type, config, { amount, currency, description, customer, redirectUrl }) => {
  switch (type) {
    case 'stripe': {
      const params = new URLSearchParams();
      params.append('mode', 'payment');
      params.append('success_url', APP_URL + '/pay/success');
      params.append('cancel_url', APP_URL + '/pay/cancelled');
      params.append('line_items[0][quantity]', '1');
      params.append('line_items[0][price_data][currency]', (currency || 'usd').toLowerCase());
      params.append('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)));
      params.append('line_items[0][price_data][product_data][name]', description || 'Payment');
      const r = await axios.post('https://api.stripe.com/v1/checkout/sessions', params, {
        headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 15000,
      });
      return { link: r.data.url, externalId: r.data.id };
    }
    case 'paypal': {
      const auth = Buffer.from(`${config.clientId}:${config.apiSecret}`).toString('base64');
      const tok = await axios.post('https://api-m.paypal.com/v1/oauth2/token', 'grant_type=client_credentials', {
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000,
      });
      const order = await axios.post('https://api-m.paypal.com/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: currency || 'USD', value: amount.toFixed(2) }, description: description || 'Payment' }],
        ...(redirectUrl ? { application_context: { return_url: redirectUrl, cancel_url: redirectUrl } } : {}),
      }, { headers: { Authorization: `Bearer ${tok.data.access_token}` }, timeout: 15000 });
      const approve = (order.data.links || []).find(l => l.rel === 'approve');
      if (!approve) throw new Error('PayPal did not return an approval link');
      return { link: approve.href, externalId: order.data.id };
    }
    case 'cashfree': {
      const r = await axios.post('https://api.cashfree.com/pg/links', {
        link_id: 'wp_' + Date.now(),
        link_amount: amount,
        link_currency: currency || 'INR',
        link_purpose: description || 'Payment',
        customer_details: { customer_phone: String(customer?.phone || '9999999999').replace(/^\+/, ''), customer_name: customer?.name || 'Customer' },
        ...(redirectUrl ? { link_meta: { return_url: redirectUrl } } : {}),
      }, {
        headers: { 'x-client-id': config.clientId, 'x-client-secret': config.apiSecret, 'x-api-version': '2023-08-01' }, timeout: 15000,
      });
      return { link: r.data.link_url, externalId: r.data.link_id };
    }
    case 'payu': {
      // PayU India create_invoice (postservice) — auth via merchant key + salt SHA-512 hash.
      const key = config.merchantKey;
      const salt = config.merchantSalt;
      const base = config.mode === 'test' ? 'https://test.payu.in' : 'https://info.payu.in';
      const txnid = 'wp' + Date.now() + Math.floor(Math.random() * 1000);
      const var1 = JSON.stringify({
        txnid,
        amount: Number(amount).toFixed(2),
        productinfo: (description || 'Payment').slice(0, 100),
        firstname: (customer?.name || 'Customer').slice(0, 60),
        email: customer?.email || 'customer@example.com',
        phone: String(customer?.phone || '9999999999').replace(/^\+/, ''),
        validationPeriod: '7',
        sendEmailInvoice: '0',
        sendSMSInvoice: '0',
        ...(redirectUrl ? { successURL: redirectUrl, failureURL: redirectUrl } : {}),
      });
      const hash = crypto.createHash('sha512').update(`${key}|create_invoice|${var1}|${salt}`).digest('hex');
      const params = new URLSearchParams({ key, command: 'create_invoice', var1, hash });
      const r = await axios.post(`${base}/merchant/postservice?form=2`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000,
      });
      const url = r.data?.URL || r.data?.url;
      if (!url) throw new Error('PayU: ' + (r.data?.msg || r.data?.message || 'could not create payment link'));
      return { link: /^https?:/i.test(url) ? url : 'https://' + url, externalId: txnid };
    }
    case 'paystack': {
      const r = await axios.post('https://api.paystack.co/transaction/initialize', {
        email: customer?.email || 'customer@example.com',
        amount: Math.round(amount * 100),
        currency: currency || 'NGN',
        ...(redirectUrl ? { callback_url: redirectUrl } : {}),
      }, { headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 15000 });
      return { link: r.data.data.authorization_url, externalId: r.data.data.reference };
    }
    case 'mercadopago': {
      const extRef = 'wp_' + Date.now();
      const r = await axios.post('https://api.mercadopago.com/checkout/preferences', {
        items: [{ title: description || 'Payment', quantity: 1, unit_price: amount, currency_id: currency || 'BRL' }],
        external_reference: extRef,
        ...(redirectUrl ? { back_urls: { success: redirectUrl, pending: redirectUrl, failure: redirectUrl }, auto_return: 'approved' } : {}),
      }, { headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 15000 });
      return { link: r.data.init_point, externalId: extRef };
    }
    case 'instamojo': {
      const r = await axios.post('https://www.instamojo.com/api/1.1/payment-requests/', new URLSearchParams({
        purpose: description || 'Payment',
        amount: String(amount),
        buyer_name: customer?.name || 'Customer',
        email: customer?.email || '',
        phone: customer?.phone || '',
        ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
      }).toString(), {
        headers: { 'X-Api-Key': config.apiKey, 'X-Auth-Token': config.authToken, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000,
      });
      if (!r.data?.success || !r.data?.payment_request?.longurl) throw new Error(JSON.stringify(r.data?.message || r.data) || 'Instamojo did not return a payment link');
      return { link: r.data.payment_request.longurl, externalId: r.data.payment_request.id };
    }
    case 'flutterwave': {
      const txRef = 'wp_' + Date.now();
      const r = await axios.post('https://api.flutterwave.com/v3/payments', {
        tx_ref: txRef,
        amount: String(amount),
        currency: currency || 'NGN',
        redirect_url: redirectUrl || (APP_URL + '/pay/success'),
        customer: { email: customer?.email || 'customer@example.com', name: customer?.name || 'Customer', phonenumber: customer?.phone || '' },
        customizations: { title: description || 'Payment' },
      }, { headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 15000 });
      if (!r.data?.data?.link) throw new Error(r.data?.message || 'Flutterwave did not return a payment link');
      return { link: r.data.data.link, externalId: txRef };
    }
    case 'mollie': {
      const r = await axios.post('https://api.mollie.com/v2/payments', {
        amount: { currency: currency || 'EUR', value: amount.toFixed(2) },
        description: description || 'Payment',
        redirectUrl: redirectUrl || (APP_URL + '/pay/success'),
      }, { headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 15000 });
      const link = r.data?._links?.checkout?.href;
      if (!link) throw new Error(r.data?.detail || 'Mollie did not return a checkout URL');
      return { link, externalId: r.data.id };
    }
    case 'phonepe': {
      // PhonePe Standard Checkout v2 (the old hermes /pg/v1 API is decommissioned).
      const token = await phonepeToken(config);
      const merchantOrderId = 'WP' + Date.now();
      const r = await axios.post('https://api.phonepe.com/apis/pg/checkout/v2/pay', {
        merchantOrderId,
        amount: Math.round(amount * 100),
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: description || 'Payment',
          merchantUrls: { redirectUrl: redirectUrl || (APP_URL + '/pay/success') },
        },
      }, { headers: { Authorization: 'O-Bearer ' + token, 'Content-Type': 'application/json' }, timeout: 15000 });
      if (!r.data?.redirectUrl) throw new Error(r.data?.message || 'PhonePe did not return a payment page URL');
      return { link: r.data.redirectUrl, externalId: merchantOrderId };
    }
    case 'paytm': {
      const body = {
        mid: config.merchantId,
        linkType: 'GENERIC',
        linkDescription: description || 'Payment',
        linkName: 'Payment',
        amount,
      };
      const checksum = paytmChecksum(JSON.stringify(body), config.apiSecret);
      const r = await axios.post('https://securegw.paytm.in/link/create', {
        body, head: { tokenType: 'AES', signature: checksum },
      }, { timeout: 15000 });
      const url = r.data?.body?.shortUrl || r.data?.body?.longUrl;
      if (!url) throw new Error(r.data?.body?.resultInfo?.resultMsg || 'Paytm did not return a link');
      return { link: url, externalId: String(r.data?.body?.linkId || '') };
    }
    default:
      throw new Error(`Payment links are not supported for ${type}`);
  }
};

// PhonePe v2 OAuth token (client id = merchant/client ID, secret = client secret).
async function phonepeToken(config) {
  let r;
  try {
    r = await axios.post('https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
      new URLSearchParams({
        client_id: config.merchantId,
        client_version: String(config.clientVersion || '1'),
        client_secret: config.apiSecret,
        grant_type: 'client_credentials',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
  } catch (e) {
    throw new Error('PhonePe rejected the configured credentials (' + (e.response?.data?.message || e.message) + '). Enter your PhonePe API Client ID as Public Key and Client Secret as Secret Key in Admin \u2192 Payment Gateways.');
  }
  if (!r.data?.access_token) throw new Error(r.data?.message || 'PhonePe auth failed \u2014 check Client ID/Secret in Payment Gateways');
  return r.data.access_token;
}

// Paytm checksum: sha256(body + salt) + salt, AES-128-CBC encrypted with merchant key.
function paytmChecksum(body, key) {
  const salt = crypto.randomBytes(3).toString('base64').slice(0, 4);
  const hash = crypto.createHash('sha256').update(body + '|' + salt).digest('hex') + salt;
  const iv = '@@@@&&&&####$$$$';
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return cipher.update(hash, 'utf8', 'base64') + cipher.final('base64');
}

// Checks whether a hosted-checkout payment has been completed on the gateway.
// Returns { paid: boolean, gatewayPaymentId?: string }.
const checkGatewayPayment = async (type, config, externalId) => {
  switch (type) {
    case 'phonepe': {
      const token = await phonepeToken(config);
      const r = await axios.get(`https://api.phonepe.com/apis/pg/checkout/v2/order/${externalId}/status`, {
        headers: { Authorization: 'O-Bearer ' + token, 'Content-Type': 'application/json' }, timeout: 15000,
      });
      return { paid: r.data?.state === 'COMPLETED', gatewayPaymentId: r.data?.orderId || externalId };
    }
    case 'cashfree': {
      const r = await axios.get('https://api.cashfree.com/pg/links/' + externalId, {
        headers: { 'x-client-id': config.clientId, 'x-client-secret': config.apiSecret, 'x-api-version': '2023-08-01' }, timeout: 15000,
      });
      return { paid: r.data?.link_status === 'PAID', gatewayPaymentId: externalId };
    }
    case 'paypal': {
      const auth = Buffer.from(`${config.clientId}:${config.apiSecret}`).toString('base64');
      const tok = await axios.post('https://api-m.paypal.com/v1/oauth2/token', 'grant_type=client_credentials', {
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000,
      });
      const hdrs = { Authorization: `Bearer ${tok.data.access_token}`, 'Content-Type': 'application/json' };
      let order = (await axios.get('https://api-m.paypal.com/v2/checkout/orders/' + externalId, { headers: hdrs, timeout: 15000 })).data;
      if (order.status === 'APPROVED') {
        try {
          order = (await axios.post(`https://api-m.paypal.com/v2/checkout/orders/${externalId}/capture`, {}, { headers: hdrs, timeout: 15000 })).data;
        } catch (e) { /* capture may race with webhook; re-check status below */ }
      }
      return { paid: order.status === 'COMPLETED', gatewayPaymentId: externalId };
    }
    case 'paystack': {
      const r = await axios.get('https://api.paystack.co/transaction/verify/' + encodeURIComponent(externalId), {
        headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 15000,
      });
      return { paid: r.data?.data?.status === 'success', gatewayPaymentId: String(r.data?.data?.id || externalId) };
    }
    case 'instamojo': {
      const r = await axios.get('https://www.instamojo.com/api/1.1/payment-requests/' + externalId + '/', {
        headers: { 'X-Api-Key': config.apiKey, 'X-Auth-Token': config.authToken }, timeout: 15000,
      });
      const pays = r.data?.payment_request?.payments || [];
      const done = r.data?.payment_request?.status === 'Completed' || pays.some((p) => p.status === 'Credit');
      return { paid: !!done, gatewayPaymentId: externalId };
    }
    case 'flutterwave': {
      const r = await axios.get('https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(externalId), {
        headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 15000,
      });
      return { paid: r.data?.data?.status === 'successful', gatewayPaymentId: String(r.data?.data?.id || externalId) };
    }
    case 'mollie': {
      const r = await axios.get('https://api.mollie.com/v2/payments/' + externalId, {
        headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 15000,
      });
      return { paid: r.data?.status === 'paid', gatewayPaymentId: externalId };
    }
    case 'mercadopago': {
      const r = await axios.get('https://api.mercadopago.com/v1/payments/search?external_reference=' + encodeURIComponent(externalId), {
        headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 15000,
      });
      const hit = (r.data?.results || []).find((p) => p.status === 'approved');
      return { paid: !!hit, gatewayPaymentId: String(hit?.id || externalId) };
    }
    case 'payu': {
      const key = config.merchantKey;
      const salt = config.merchantSalt;
      const base = config.mode === 'test' ? 'https://test.payu.in' : 'https://info.payu.in';
      const hash = crypto.createHash('sha512').update(`${key}|verify_payment|${externalId}|${salt}`).digest('hex');
      const params = new URLSearchParams({ key, command: 'verify_payment', var1: externalId, hash });
      const r = await axios.post(`${base}/merchant/postservice?form=2`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000,
      });
      const det = (r.data?.transaction_details && r.data.transaction_details[externalId]) || {};
      return { paid: String(det.status || '').toLowerCase() === 'success', gatewayPaymentId: det.mihpayid || externalId };
    }
    default:
      throw new Error(`Payment status check is not supported for ${type}`);
  }
};

// Validates gateway credentials with a cheap, non-charging live API call.
// `cfg` uses the same shape hostedGatewayConfig() produces (merchantKey/apiSecret/etc).
// Returns { ok: boolean, message: string, unsupported?: boolean }.
const testGatewayCredentials = async (type, cfg) => {
  const c = cfg || {};
  const explain = (e, fallback) => {
    const s = e.response && e.response.status;
    const d = e.response && e.response.data;
    const m = (d && (d.message || d.error_description || (d.error && (d.error.message || d.error.description || (typeof d.error === 'string' ? d.error : ''))) || d.msg)) || e.message;
    if (s === 401 || s === 403) return `Invalid credentials (HTTP ${s})${m ? ' — ' + m : ''}`;
    return `${fallback}${m ? ' — ' + m : ''}`;
  };
  switch (type) {
    case 'manual':
      return { ok: true, message: 'Manual payment needs no API keys.' };
    case 'razorpay': {
      if (!c.keyId || !c.keySecret) return { ok: false, message: 'Enter Key ID and Key Secret first.' };
      try {
        await axios.get('https://api.razorpay.com/v1/payments?count=1', { auth: { username: c.keyId, password: c.keySecret }, timeout: 15000 });
        return { ok: true, message: 'Razorpay keys are valid.' };
      } catch (e) { return { ok: false, message: explain(e, 'Razorpay test failed') }; }
    }
    case 'stripe': {
      if (!c.secretKey) return { ok: false, message: 'Enter the Secret Key first.' };
      try {
        await axios.get('https://api.stripe.com/v1/balance', { headers: { Authorization: 'Bearer ' + c.secretKey }, timeout: 15000 });
        return { ok: true, message: 'Stripe secret key is valid.' };
      } catch (e) { return { ok: false, message: explain(e, 'Stripe test failed') }; }
    }
    case 'payu': {
      if (!c.merchantKey || !c.merchantSalt) return { ok: false, message: 'Enter Merchant Key and Merchant Salt first.' };
      const base = c.mode === 'test' ? 'https://test.payu.in' : 'https://info.payu.in';
      const dummy = 'wptest' + Date.now();
      const hash = crypto.createHash('sha512').update(`${c.merchantKey}|verify_payment|${dummy}|${c.merchantSalt}`).digest('hex');
      const params = new URLSearchParams({ key: c.merchantKey, command: 'verify_payment', var1: dummy, hash });
      try {
        const r = await axios.post(`${base}/merchant/postservice?form=2`, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
        // PayU returns status 1 when the Merchant Key + Salt (hash) are accepted, even if the txn id is unknown.
        if (r.data && Number(r.data.status) === 1) return { ok: true, message: 'PayU Merchant Key + Salt are valid.' };
        return { ok: false, message: 'PayU rejected the credentials: ' + ((r.data && r.data.msg) || 'invalid Merchant Key/Salt') };
      } catch (e) { return { ok: false, message: explain(e, 'PayU test failed') }; }
    }
    case 'paypal': {
      if (!c.clientId || !c.apiSecret) return { ok: false, message: 'Enter Client ID and Client Secret first.' };
      try {
        const r = await axios.post('https://api-m.paypal.com/v1/oauth2/token', 'grant_type=client_credentials', { auth: { username: c.clientId, password: c.apiSecret }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
        return r.data && r.data.access_token ? { ok: true, message: 'PayPal credentials are valid (Live).' } : { ok: false, message: 'PayPal did not return an access token.' };
      } catch (e) { return { ok: false, message: explain(e, 'PayPal test failed (are these Live credentials?)') }; }
    }
    case 'cashfree': {
      if (!c.clientId || !c.apiSecret) return { ok: false, message: 'Enter App ID and Secret Key first.' };
      try {
        const r = await axios.get('https://api.cashfree.com/pg/orders/wptest_nonexistent', { headers: { 'x-client-id': c.clientId, 'x-client-secret': c.apiSecret, 'x-api-version': '2023-08-01' }, timeout: 15000, validateStatus: () => true });
        if (r.status === 401 || r.status === 403) return { ok: false, message: 'Cashfree rejected the credentials (HTTP ' + r.status + ').' };
        return { ok: true, message: 'Cashfree credentials are valid.' };
      } catch (e) { return { ok: false, message: explain(e, 'Cashfree test failed') }; }
    }
    case 'paystack': {
      if (!c.apiKey) return { ok: false, message: 'Enter the Secret Key first.' };
      try {
        await axios.get('https://api.paystack.co/transaction?perPage=1', { headers: { Authorization: 'Bearer ' + c.apiKey }, timeout: 15000 });
        return { ok: true, message: 'Paystack secret key is valid.' };
      } catch (e) { return { ok: false, message: explain(e, 'Paystack test failed') }; }
    }
    case 'instamojo': {
      if (!c.apiKey || !c.authToken) return { ok: false, message: 'Enter API Key and Auth Token first.' };
      try {
        const r = await axios.get('https://www.instamojo.com/api/1.1/payment-requests/', { headers: { 'X-Api-Key': c.apiKey, 'X-Auth-Token': c.authToken }, timeout: 15000, validateStatus: () => true });
        if (r.status === 401 || r.status === 403) return { ok: false, message: 'Instamojo rejected the credentials (HTTP ' + r.status + ').' };
        return { ok: true, message: 'Instamojo credentials are valid.' };
      } catch (e) { return { ok: false, message: explain(e, 'Instamojo test failed') }; }
    }
    case 'flutterwave': {
      if (!c.apiKey) return { ok: false, message: 'Enter the Secret Key first.' };
      try {
        const r = await axios.get('https://api.flutterwave.com/v3/subaccounts?page=1', { headers: { Authorization: 'Bearer ' + c.apiKey }, timeout: 15000, validateStatus: () => true });
        if (r.status === 401 || r.status === 403) return { ok: false, message: 'Flutterwave rejected the Secret Key (HTTP ' + r.status + ').' };
        return { ok: true, message: 'Flutterwave secret key is valid.' };
      } catch (e) { return { ok: false, message: explain(e, 'Flutterwave test failed') }; }
    }
    case 'mollie': {
      if (!c.apiKey) return { ok: false, message: 'Enter the API Key first.' };
      try {
        await axios.get('https://api.mollie.com/v2/methods', { headers: { Authorization: 'Bearer ' + c.apiKey }, timeout: 15000 });
        return { ok: true, message: 'Mollie API key is valid.' };
      } catch (e) { return { ok: false, message: explain(e, 'Mollie test failed') }; }
    }
    case 'mercadopago': {
      if (!c.apiKey) return { ok: false, message: 'Enter the Access Token first.' };
      try {
        await axios.get('https://api.mercadopago.com/v1/payment_methods', { headers: { Authorization: 'Bearer ' + c.apiKey }, timeout: 15000 });
        return { ok: true, message: 'Mercado Pago access token is valid.' };
      } catch (e) { return { ok: false, message: explain(e, 'Mercado Pago test failed') }; }
    }
    case 'phonepe': {
      if (!c.merchantId || !c.apiSecret) return { ok: false, message: 'Enter Client ID and Client Secret first.' };
      try {
        await phonepeToken(c);
        return { ok: true, message: 'PhonePe credentials are valid.' };
      } catch (e) { return { ok: false, message: explain(e, 'PhonePe test failed') }; }
    }
    default:
      return { ok: false, unsupported: true, message: 'Live credential test is not available for this gateway yet — it is validated at checkout.' };
  }
};

module.exports = { createGatewayLink, checkGatewayPayment, testGatewayCredentials };
