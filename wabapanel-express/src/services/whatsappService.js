const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const walletBilling = require('./walletBilling');

const execFileAsync = util.promisify(execFile);

class WhatsAppService {
  constructor(accessToken, phoneNumberId) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.baseUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async sendTextMessage(to, text, contextMessageId) {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };
    if (contextMessageId) data.context = { message_id: contextMessageId };
    return this._makeRequest(url, data);
  }

  async sendReaction(to, messageId, emoji) {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji: emoji || '' },
    };
    return this._makeRequest(url, data);
  }

  async sendTemplateMessage(to, templateName, language, components = []) {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    };
    return this._makeRequest(url, data);
  }

  // Upload media bytes to WhatsApp and return a media id. Sending audio by id (rather than
  // by link) lets us control the Content-Type, avoiding "processed as application/octet-stream" errors.
  async uploadMediaById(buffer, contentType, filename) {
    const FormData = require('form-data');
    const fd = new FormData();
    fd.append('messaging_product', 'whatsapp');
    fd.append('type', contentType);
    fd.append('file', buffer, { filename: filename || 'file', contentType });
    const res = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/media`, fd, {
      headers: { ...fd.getHeaders(), 'Authorization': `Bearer ${this.accessToken}` },
      maxBodyLength: Infinity,
    });
    return res.data?.id || null;
  }

  // Transcode a recorded audio buffer to ogg/opus (a real WhatsApp voice note).
  // Browser recorders (Android Chrome / desktop) produce audio/webm which the
  // WhatsApp Cloud API rejects; ffmpeg re-encodes it to the supported codec.
  async _transcodeToOgg(buffer, srcCt) {
    const ext = srcCt.includes('webm') ? 'webm'
      : srcCt.includes('mp4') || srcCt.includes('m4a') ? 'm4a'
      : srcCt.includes('ogg') ? 'ogg'
      : srcCt.includes('mpeg') ? 'mp3'
      : srcCt.includes('aac') ? 'aac'
      : srcCt.includes('wav') ? 'wav'
      : 'dat';
    const base = path.join(os.tmpdir(), `wa-voice-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const inPath = `${base}.${ext}`;
    const outPath = `${base}.ogg`;
    fs.writeFileSync(inPath, buffer);
    try {
      await execFileAsync('ffmpeg', ['-y', '-i', inPath, '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', outPath], { timeout: 30000 });
      return fs.readFileSync(outPath);
    } finally {
      try { fs.unlinkSync(inPath); } catch (e) { /* noop */ }
      try { fs.unlinkSync(outPath); } catch (e) { /* noop */ }
    }
  }

  async sendMediaMessage(to, mediaType, mediaUrl, caption = '', contextMessageId) {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    let mediaObj = { link: mediaUrl };

    // Audio (voice notes): upload to WhatsApp first and send by id so the codec/mimetype
    // is set explicitly (link delivery can be mis-detected as application/octet-stream).
    if (mediaType === 'audio') {
      try {
        const dl = await axios.get(mediaUrl, { responseType: 'arraybuffer', maxRedirects: 5, timeout: 30000 });
        let buffer = Buffer.from(dl.data);
        let ct = (dl.headers['content-type'] || '').split(';')[0].trim();
        if (!ct || ct === 'application/octet-stream') {
          ct = /\.ogg($|\?)/i.test(mediaUrl) ? 'audio/ogg'
            : /\.mp3($|\?)/i.test(mediaUrl) ? 'audio/mpeg'
            : /\.m4a($|\?)|\.mp4($|\?)/i.test(mediaUrl) ? 'audio/mp4'
            : /\.webm($|\?)/i.test(mediaUrl) ? 'audio/webm'
            : 'audio/ogg';
        }
        // WhatsApp Cloud API accepts only ogg(opus)/mp3/mp4/aac/amr for audio; a
        // browser voice recording is usually audio/webm, which WA rejects with a
        // "failed" send. Transcode anything unsupported to ogg/opus first.
        const WA_OK = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'];
        if (!WA_OK.includes(ct)) {
          try {
            buffer = await this._transcodeToOgg(buffer, ct);
            ct = 'audio/ogg';
          } catch (te) {
            console.error('[AUDIO] transcode failed, sending original:', te.message);
          }
        }
        const fname = ct === 'audio/mpeg' ? 'voice.mp3' : ct === 'audio/mp4' ? 'voice.m4a' : 'voice.ogg';
        const mediaId = await this.uploadMediaById(buffer, ct, fname);
        if (mediaId) mediaObj = { id: mediaId };
      } catch (e) {
        console.error('[AUDIO] upload-by-id FAILED, falling back to link:', e.response?.data || e.message);
      }
    }

    if (caption && ['image', 'video', 'document'].includes(mediaType)) {
      mediaObj.caption = caption;
    }
    const data = {
      messaging_product: 'whatsapp',
      to,
      type: mediaType,
      [mediaType]: mediaObj,
    };
    if (contextMessageId) data.context = { message_id: contextMessageId };
    return this._makeRequest(url, data);
  }

  // WhatsApp Pay (India): in-chat order_details message — customer pays via UPI
  // without leaving WhatsApp. Requires a payment configuration set up in
  // WhatsApp Manager (Razorpay / PayU / UPI VPA).
  async sendOrderDetails(to, { referenceId, amount, description, paymentConfiguration, itemName }) {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const value = Math.round(amount * 100);
    const data = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'order_details',
        body: { text: description || `Payment request of ₹${amount}` },
        action: {
          name: 'review_and_pay',
          parameters: {
            reference_id: referenceId,
            type: 'digital-goods',
            payment_type: 'upi',
            payment_configuration: paymentConfiguration,
            currency: 'INR',
            total_amount: { value, offset: 100 },
            order: {
              status: 'pending',
              items: [{
                retailer_id: referenceId,
                name: itemName || description || 'Payment',
                amount: { value, offset: 100 },
                quantity: 1,
              }],
              subtotal: { value, offset: 100 },
            },
          },
        },
      },
    };
    return this._makeRequest(url, data);
  }

  async sendInteractiveMessage(to, interactive) {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive,
    };
    return this._makeRequest(url, data);
  }

  async sendLocationMessage(to, latitude, longitude, name = '', address = '') {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      to,
      type: 'location',
      location: { latitude, longitude, name, address },
    };
    return this._makeRequest(url, data);
  }

  async markAsRead(messageId) {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };
    return this._makeRequest(url, data);
  }

  async getMediaUrl(mediaId) {
    const url = `${this.baseUrl}/${mediaId}`;
    const response = await axios.get(url, { headers: this.getHeaders() });
    return response.data.url;
  }

  async downloadMedia(mediaUrl) {
    const response = await axios.get(mediaUrl, {
      headers: this.getHeaders(),
      responseType: 'arraybuffer',
    });
    return response.data;
  }

  async getBusinessProfile() {
    const url = `${this.baseUrl}/${this.phoneNumberId}/whatsapp_business_profile`;
    const response = await axios.get(url, {
      headers: this.getHeaders(),
      params: { fields: 'about,address,description,email,profile_picture_url,websites,vertical' },
    });
    return response.data;
  }

  async getPhoneNumberDetails() {
    const url = `${this.baseUrl}/${this.phoneNumberId}`;
    const response = await axios.get(url, {
      headers: this.getHeaders(),
      params: { fields: 'display_phone_number,verified_name,quality_rating,code_verification_status,platform_type' },
    });
    return response.data;
  }

  async uploadMediaForTemplate(mediaUrl) {
    try {
      const fs = require('fs');
      const path = require('path');
      let buffer = null;
      let contentType = null;
      // If the URL points to this panel's own uploads, read the file straight
      // from local disk. This is proxy-independent: some reverse proxies route
      // bare /uploads to the frontend (returns 404 HTML), which would break an
      // HTTP download and cause the header example to be dropped -> Meta rejects
      // the template with "HEADER is missing expected field(s) (example)".
      const m = String(mediaUrl || '').match(/\/(?:api\/)?uploads\/(.+)$/);
      if (m) {
        const filePath = path.join(__dirname, '..', '..', 'uploads', m[1].split('?')[0]);
        if (fs.existsSync(filePath)) {
          buffer = fs.readFileSync(filePath);
          const ext = path.extname(filePath).toLowerCase();
          contentType = ext === '.png' ? 'image/png'
            : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
            : ext === '.gif' ? 'image/gif'
            : ext === '.webp' ? 'image/webp'
            : ext === '.mp4' ? 'video/mp4'
            : ext === '.pdf' ? 'application/pdf'
            : 'image/jpeg';
          console.log('[WhatsApp] Read local media:', filePath, 'size:', buffer.length, 'type:', contentType);
        }
      }
      if (!buffer) {
        // Remote URL (S3/CDN) or local file not found — download over HTTP.
        const response = await axios.get(mediaUrl, { responseType: 'arraybuffer', maxRedirects: 5, timeout: 30000 });
        buffer = Buffer.from(response.data);
        contentType = response.headers['content-type'] || 'image/jpeg';
        console.log('[WhatsApp] Downloaded media:', mediaUrl, 'size:', buffer.length, 'type:', contentType);
      }
      
      // Create upload session using the Graph API resumable upload
      const sessionUrl = `${this.baseUrl}/app/uploads`;
      const sessionRes = await axios.post(sessionUrl, null, {
        params: { 
          file_length: buffer.length, 
          file_type: contentType,
          messaging_product: 'whatsapp'
        },
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      const uploadSessionId = sessionRes.data?.id;
      console.log('[WhatsApp] Upload session created:', uploadSessionId);
      if (!uploadSessionId) return null;

      // Upload the file bytes
      const uploadRes = await axios.post(
        `${this.baseUrl}/${uploadSessionId}`,
        buffer,
        { 
          headers: { 
            'Authorization': `OAuth ${this.accessToken}`, 
            'Content-Type': contentType,
            'file_offset': '0'
          } 
        }
      );
      const handle = uploadRes.data?.h;
      console.log('[WhatsApp] Upload complete, handle:', handle ? handle.substring(0, 30) + '...' : 'null');
      return handle || null;
    } catch (err) {
      console.error('[WhatsApp] Media upload for template failed:', err.response?.data || err.message);
      return null;
    }
  }

  async createTemplate(name, category, language, components, wabaId = null) {
    const businessId = wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!businessId) throw new Error('WhatsApp Business Account ID not configured');

    // Handle media headers - upload to Meta first
    for (const comp of components) {
      if (comp.type === 'CAROUSEL' && Array.isArray(comp.cards)) {
        for (const card of comp.cards) {
          for (const cc of (card.components || [])) {
            if (cc.type === 'HEADER' && ['IMAGE', 'VIDEO'].includes(cc.format)) {
              const cardMediaUrl = cc.example?.header_handle?.[0];
              if (cardMediaUrl && cardMediaUrl.startsWith('http')) {
                let cardHandle = await this.uploadMediaForTemplate(cardMediaUrl);
                if (!cardHandle) {
                  await new Promise(r => setTimeout(r, 2000));
                  cardHandle = await this.uploadMediaForTemplate(cardMediaUrl);
                }
                if (cardHandle) cc.example = { header_handle: [cardHandle] };
              }
            }
          }
        }
      }
      if (comp.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(comp.format)) {
        const mediaUrl = comp.example?.header_handle?.[0];
        if (mediaUrl && mediaUrl.startsWith('http')) {
          // Try uploading to Meta (with retry)
          let handle = await this.uploadMediaForTemplate(mediaUrl);
          if (!handle) {
            console.log('[Template] First upload attempt failed, retrying...');
            await new Promise(r => setTimeout(r, 2000));
            handle = await this.uploadMediaForTemplate(mediaUrl);
          }
          if (handle) {
            comp.example = { header_handle: [handle] };
            console.log('[Template] Using uploaded handle for header media');
          } else {
            // Do not submit a media header without a valid handle — Meta would
            // reject it as "HEADER is missing expected field(s) (example)".
            // Surface a clear error instead of a cryptic Meta rejection.
            console.error('[Template] Media upload failed after retry for', mediaUrl);
            throw new Error('Header image could not be uploaded to WhatsApp. Please re-upload the header image and try again.');
          }
        }
      }
    }

    const url = `${this.baseUrl}/${businessId}/message_templates`;
    const data = { name, category, language, components };
    console.log('[Template] Sending to Meta:', name, 'components count:', components.length);
    return this._makeRequest(url, data);
  }

  async getTemplates(limit = 100, wabaId = null) {
    const businessId = wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!businessId) throw new Error('WhatsApp Business Account ID not configured');
    const url = `${this.baseUrl}/${businessId}/message_templates`;
    const response = await axios.get(url, {
      headers: this.getHeaders(),
      params: { limit },
    });
    return response.data;
  }

  async deleteTemplate(templateName, wabaId = null) {
    const businessId = wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const url = `${this.baseUrl}/${businessId}/message_templates`;
    return axios.delete(url, {
      headers: this.getHeaders(),
      params: { name: templateName },
    });
  }

  async _makeRequest(url, data) {
    const templateName = data && data.type === 'template' && data.template ? data.template.name : null;
    try {
      if (templateName) {
        try {
          await walletBilling.assertCanSendTemplate(this.phoneNumberId, templateName);
        } catch (billErr) {
          if (billErr.code === 'INSUFFICIENT_WALLET') {
            return { success: false, error: { message: 'Insufficient wallet balance. Please top up to send template messages.', code: 'INSUFFICIENT_WALLET' } };
          }
          throw billErr;
        }
      }
      const response = await axios.post(url, data, { headers: this.getHeaders() });
      if (templateName) {
        try { await walletBilling.chargeForTemplate(this.phoneNumberId, templateName); } catch (e) { console.error('Wallet charge failed:', e.message); }
      }
      return { success: true, data: response.data };
    } catch (error) {
      const errorData = error.response?.data?.error || { message: error.message };
      console.error('WhatsApp API Error:', errorData);
      return { success: false, error: errorData };
    }
  }
}

module.exports = WhatsAppService;
