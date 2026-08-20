// Send-time components for dynamic URL buttons (a URL button whose value contains {{n}}).
// WhatsApp/Meta rejects the send (#131008 "required parameter missing") unless each such
// button is supplied its variable value as a `button` / `sub_type:url` component.
// `resolve(button, index)` returns the value that fills the {{n}} placeholder.
function buildUrlButtonComponents(buttons, resolve) {
  const out = [];
  (buttons || []).forEach((b, idx) => {
    if (b && b.type === 'url' && /\{\{\d+\}\}/.test(b.value || '')) {
      let text = '';
      try { text = resolve ? resolve(b, idx) : ''; } catch (e) { text = ''; }
      text = String(text == null ? '' : text).replace(/[\n\t]+/g, ' ').trim().slice(0, 2000) || '-';
      out.push({ type: 'button', sub_type: 'url', index: idx, parameters: [{ type: 'text', text }] });
    }
  });
  return out;
}

module.exports = { buildUrlButtonComponents };
