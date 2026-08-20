// Resolve WhatsApp send credentials for a given sender phone-number id.
// An extra number may belong to a DIFFERENT WABA and carry its own access token;
// in that case we must send with that number's token, not the workspace's main token.
// When the extra number has no token (same WABA), or the id is the main number,
// the main workspace token is used — preserving existing behaviour.
function resolveWaCreds(waCfg, senderId) {
  const accessToken = waCfg ? waCfg.accessToken : '';
  const pid = senderId || (waCfg ? waCfg.phoneNumberId : '');
  if (!waCfg) return { accessToken, phoneNumberId: pid };
  const extra = (waCfg.extraNumbers || []).find(
    (n) => n && n.phoneNumberId === pid && n.accessToken
  );
  return { accessToken: extra ? extra.accessToken : accessToken, phoneNumberId: pid };
}

module.exports = { resolveWaCreds };
