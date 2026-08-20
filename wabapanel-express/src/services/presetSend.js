// Builds and sends a preset (non-template) message inside the 24h window.
const sendPreset = async (waService, phone, preset, contact) => {
  // Preset linked to an approved carousel template: send that template (works even as preset).
  if (preset.carouselTemplate) {
    const Template = require('../models/Template');
    const tpl = await Template.findOne({ workspace: preset.workspace, name: preset.carouselTemplate });
    if (tpl) {
      const components = [];
      if (tpl.carousel && tpl.carousel.cards && tpl.carousel.cards.length) {
        components.push(require('../utils/carousel').buildCarouselComponent(tpl.carousel.cards));
      }
      const result = await waService.sendTemplateMessage(phone, tpl.name, tpl.language || 'en', components);
      return { result, msgType: 'template', renderedText: preset.body || ('Carousel: ' + tpl.name) };
    }
  }
  // Products/catalog preset: send selected products as an interactive list.
  if (preset.productIds && preset.productIds.length) {
    const Product = require('../models/Product');
    const prods = await Product.find({ workspace: preset.workspace, _id: { $in: preset.productIds }, status: 'active' }).lean();
    if (prods.length) {
      const nameP = (contact && (contact.name || '').trim()) || 'ji';
      const bodyText = (preset.body || '').replace(/\{\{\s*(name|naam|1)\s*\}\}/gi, nameP) || 'Hamare products dekhein 👇';
      const rows = prods.slice(0, 10).map((p) => ({
        id: `prsprod_${preset._id || 'x'}_${p._id}`,
        title: String(p.name).slice(0, 24),
        description: `${p.currency === 'INR' ? '₹' : ''}${p.price || ''}${p.description ? ' — ' + p.description : ''}`.slice(0, 72),
      }));
      const result = await waService.sendInteractiveMessage(phone, {
        type: 'list',
        body: { text: bodyText },
        action: { button: 'View Products', sections: [{ title: 'Products', rows }] },
      });
      return { result, msgType: 'interactive', renderedText: bodyText, interactive: { type: 'list', body: bodyText, ctaText: 'View Products', sections: [{ title: 'Products', rows }] } };
    }
  }
  // Free card carousel: each card goes as its own image+text+buttons message (no template charge).
  const cardsArr = (preset.cards || []).filter((c) => (c.mediaUrl || '').trim() || (c.body || '').trim());
  if (cardsArr.length) {
    const nameC = (contact && (contact.name || '').trim()) || 'ji';
    const fillC = (t) => (t || '').replace(/\{\{\s*(name|naam|1)\s*\}\}/gi, nameC);
    if ((preset.body || '').trim()) { try { await waService.sendTextMessage(phone, fillC(preset.body)); } catch {} }
    let last = null;
    let lastInteractive = null;
    for (const c of cardsArr) {
      const btns = (c.buttons || []).filter((b) => b.text && b.text.trim()).slice(0, 3);
      if (btns.length) {
        const interactive = {
          type: 'button',
          body: { text: (fillC(c.body) || '').trim() || '\u{1F447} Choose an option' },
          action: { buttons: btns.map((b, bi) => ({ type: 'reply', reply: { id: 'pcard_' + (preset._id || 'x') + '_' + bi, title: b.text.trim().slice(0, 20) } })) },
        };
        if ((c.mediaUrl || '').trim()) interactive.header = { type: 'image', image: { link: c.mediaUrl.trim() } };
        last = await waService.sendInteractiveMessage(phone, interactive);
        lastInteractive = { type: 'button', body: interactive.body.text, buttons: interactive.action.buttons.map((b) => ({ id: b.reply.id, title: b.reply.title })) };
      } else if ((c.mediaUrl || '').trim()) {
        last = await waService.sendMediaMessage(phone, 'image', c.mediaUrl.trim(), fillC(c.body));
      } else {
        last = await waService.sendTextMessage(phone, fillC(c.body));
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    return { result: last || { success: false }, msgType: 'interactive', renderedText: preset.body || ('Cards: ' + cardsArr.length), interactive: lastInteractive || undefined };
  }
  const name = (contact && (contact.name || '').trim()) || 'ji';
  const fill = (t) => (t || '').replace(/\{\{\s*(name|naam|1)\s*\}\}/gi, name);
  preset = Object.assign({}, preset.toObject ? preset.toObject() : preset);
  preset.body = fill(preset.body);
  preset.headerText = fill(preset.headerText);
  preset.footer = fill(preset.footer);
  const allBtns = (preset.buttons || []).filter((b) => b.text && b.text.trim());
  // A single lone URL button is sent as a real clickable CTA button. When there
  // are 2-3 URL/Call buttons, a free-form message can't make them all clickable
  // CTAs, so they go as reply buttons and a tap auto-replies with the link/number.
  const onlyUrl = allBtns.length === 1 && allBtns[0].type === 'URL' && !!allBtns[0].url;
  const urlBtn = onlyUrl ? allBtns[0] : null;
  const btns = onlyUrl ? [] : allBtns;
  const listUrlBtn = allBtns.find((b) => b.type === 'URL' && b.url);
  const hasMedia = ['image', 'video', 'document'].includes(preset.headerType) && preset.mediaUrl;
  const listItems = (preset.listItems || []).filter((it) => it.title && it.title.trim());
  if (listItems.length) {
    // List messages can't carry a media header - send the media first.
    if (hasMedia) {
      try { await waService.sendMediaMessage(phone, preset.headerType, preset.mediaUrl, ''); } catch {}
    }
    const interactive = {
      type: 'list',
      body: { text: preset.body },
      action: {
        button: (preset.listButtonText || 'Menu').slice(0, 20),
        sections: [{
          rows: listItems.slice(0, 10).map((it, i) => ({
            id: 'plist_' + (preset._id || 'x') + '_' + i,
            title: it.title.trim().slice(0, 24),
            description: (it.description || '').trim().slice(0, 72) || undefined,
          })),
        }],
      },
    };
    if (preset.footer) interactive.footer = { text: preset.footer };
    if (preset.headerType === 'text' && preset.headerText) interactive.header = { type: 'text', text: preset.headerText };
    const listRes = await waService.sendInteractiveMessage(phone, interactive);
    if (!listRes?.success) console.error('[Preset] list send error:', JSON.stringify(listRes?.error || listRes).slice(0, 300));
    if (listUrlBtn && listRes?.success) {
      try {
        await new Promise((r) => setTimeout(r, 2000));
        await waService.sendInteractiveMessage(phone, {
          type: 'cta_url',
          body: { text: listUrlBtn.text.trim() },
          action: { name: 'cta_url', parameters: { display_text: listUrlBtn.text.trim().slice(0, 20), url: listUrlBtn.url } },
        });
      } catch (e) { console.error('[Preset] cta_url follow-up failed:', e.message); }
    }
    return {
      result: listRes,
      msgType: 'interactive',
      renderedText: preset.body,
      interactive: {
        type: 'list',
        body: preset.body,
        ctaText: (preset.listButtonText || 'Menu').slice(0, 20),
        ctaUrl: listUrlBtn ? listUrlBtn.url : '',
        sections: interactive.action.sections,
      },
    };
  }
  if (btns.length) {
    const interactive = {
      type: 'button',
      body: { text: preset.body },
      action: { buttons: btns.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: 'preset_' + (preset._id || 'x') + '_' + allBtns.indexOf(b), title: b.text.trim().slice(0, 20) } })) },
    };
    if (preset.footer) interactive.footer = { text: preset.footer };
    if (preset.headerType === 'text' && preset.headerText) interactive.header = { type: 'text', text: preset.headerText };
    else if (hasMedia) interactive.header = { type: preset.headerType, [preset.headerType]: { link: preset.mediaUrl } };
    const mainRes = await waService.sendInteractiveMessage(phone, interactive);
    return {
      result: mainRes,
      msgType: 'interactive',
      renderedText: preset.body,
      interactive: {
        type: 'button',
        body: preset.body,
        buttons: interactive.action.buttons.map((b) => ({ id: b.reply.id, title: b.reply.title })),
      },
    };
  }
  if (!btns.length && urlBtn) {
    const interactive = {
      type: 'cta_url',
      body: { text: preset.body },
      action: { name: 'cta_url', parameters: { display_text: urlBtn.text.trim().slice(0, 20), url: urlBtn.url } },
    };
    if (preset.footer) interactive.footer = { text: preset.footer };
    if (preset.headerType === 'text' && preset.headerText) interactive.header = { type: 'text', text: preset.headerText };
    else if (hasMedia) interactive.header = { type: preset.headerType, [preset.headerType]: { link: preset.mediaUrl } };
    return {
      result: await waService.sendInteractiveMessage(phone, interactive),
      msgType: 'interactive',
      renderedText: preset.body,
      interactive: { type: 'cta_url', body: preset.body, ctaText: urlBtn.text.trim(), ctaUrl: urlBtn.url },
    };
  }
  if (hasMedia) {
    const caption = [preset.body, preset.footer].filter(Boolean).join('\n\n');
    return { result: await waService.sendMediaMessage(phone, preset.headerType, preset.mediaUrl, caption), msgType: preset.headerType, renderedText: caption };
  }
  let text = preset.body;
  if (preset.headerType === 'text' && preset.headerText) text = '*' + preset.headerText + '*\n\n' + text;
  if (preset.footer) text += '\n\n_' + preset.footer + '_';
  return { result: await waService.sendTextMessage(phone, text), msgType: 'text', renderedText: text };
};

module.exports = { sendPreset };
