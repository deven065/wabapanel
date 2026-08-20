const axios = require('axios');
const jwt = require('jsonwebtoken');

async function getToken(saJson) {
  const sa = typeof saJson === 'string' ? JSON.parse(saJson) : saJson;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }, sa.private_key, { algorithm: 'RS256' });
  const r = await axios.post('https://oauth2.googleapis.com/token',
    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return r.data.access_token;
}

function contactRow(c) {
  return [c.name || '', c.phone || '', c.email || '', (c.tags || []).join(', '), c.createdAt ? new Date(c.createdAt).toISOString().replace('T', ' ').slice(0, 16) : ''];
}

async function exportContacts(config, contacts) {
  const token = await getToken(config.apiKey);
  const values = [['Name', 'Phone', 'Email', 'Tags', 'Created'], ...contacts.map(contactRow)];
  await axios.put(`https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/A1?valueInputOption=RAW`,
    { values }, { headers: { Authorization: `Bearer ${token}` } });
  return contacts.length;
}

// Append a single new lead (fire-and-forget safe)
async function appendLead(workspaceId, contact) {
  try {
    const Integration = require('../models/Integration');
    const integ = await Integration.findOne({ workspace: workspaceId, type: 'google-sheets', connected: true }).lean();
    if (!integ?.config?.apiKey || !integ?.config?.sheetId) return;
    const token = await getToken(integ.config.apiKey);
    await axios.post(`https://sheets.googleapis.com/v4/spreadsheets/${integ.config.sheetId}/values/A1:append?valueInputOption=RAW`,
      { values: [contactRow(contact)] }, { headers: { Authorization: `Bearer ${token}` } });
    console.log('[Sheets] lead appended:', contact.phone);
  } catch (e) {
    console.error('[Sheets] append failed:', e.response?.data?.error?.message || e.message);
  }
}

module.exports = { exportContacts, appendLead };
