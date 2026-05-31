'use strict';
const { registerChannelAdapter } = require('./registry');
const TOKEN = process.env.KORVIN_WHATSAPP_TOKEN;
const PHONE_ID = process.env.KORVIN_WHATSAPP_PHONE_ID;
async function send(to, text) {
  if (!TOKEN || !PHONE_ID) {
    throw new Error('WhatsApp not configured: set KORVIN_WHATSAPP_TOKEN and KORVIN_WHATSAPP_PHONE_ID');
  }
  const res = await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  if (!res.ok) throw new Error('WhatsApp API error: ' + res.status);
  return await res.json();
}
if (TOKEN && PHONE_ID) {
  registerChannelAdapter('whatsapp', { send });
  console.log('[Korvin] WhatsApp channel adapter registered');
}
module.exports = { send };
