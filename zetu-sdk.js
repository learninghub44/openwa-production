/**
 * Zetu SDK — drop into any of your Node.js projects.
 *
 * Usage:
 *   const wa = require('./zetu-sdk');
 *   await wa.sendText('session-id', '0712345678', 'Hello!');
 *
 * Or custom instance:
 *   const { ZetuClient } = require('./zetu-sdk');
 *   const wa = new ZetuClient('https://your-zetu.onrender.com', 'owa_k1_...');
 */

class ZetuClient {
  constructor(
    url = process.env.OPENWA_URL || 'https://your-zetu.onrender.com',
    apiKey = process.env.OPENWA_API_KEY || ''
  ) {
    this.url = url.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async _req(method, path, body) {
    const res = await fetch(`${this.url}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Zetu ${res.status} ${path}: ${text}`);
    return text ? JSON.parse(text) : null;
  }

  /**
   * Convert any Kenyan phone number to Baileys WA ID format.
   * "0712345678" | "+254712345678" | "254712345678" → "254712345678@s.whatsapp.net"
   */
  toWAId(phone) {
    let n = String(phone).replace(/\D/g, '');
    if (n.startsWith('0')) n = '254' + n.slice(1);
    if (!n.startsWith('254') && n.length <= 9) n = '254' + n;
    return `${n}@s.whatsapp.net`;
  }

  // ── Sessions ────────────────────────────────────────────────────────────
  getSessions()           { return this._req('GET', '/sessions'); }
  getSession(id)          { return this._req('GET', `/sessions/${id}`); }
  getQRUrl(id)            { return `${this.url}/api/sessions/${id}/qr`; }

  // ── Messages ────────────────────────────────────────────────────────────

  /** Send plain text message */
  sendText(sessionId, phone, text) {
    return this._req('POST', `/sessions/${sessionId}/messages/send-text`, {
      to: this.toWAId(phone), text,
    });
  }

  /** Send image or document. filename triggers document mode. */
  sendMedia(sessionId, phone, mediaUrl, caption = '', filename = '') {
    const body = { to: this.toWAId(phone), url: mediaUrl, caption };
    if (filename) body.filename = filename;
    return this._req('POST', `/sessions/${sessionId}/messages/send-media`, body);
  }

  /** Send using a saved template with variable substitution */
  sendTemplate(sessionId, phone, templateName, variables = {}) {
    return this._req('POST', `/sessions/${sessionId}/messages/send-template`, {
      to: this.toWAId(phone), templateName, variables,
    });
  }

  /** Send to multiple numbers with a delay between each */
  sendBulk(sessionId, messages, delayMs = 2000) {
    return this._req('POST', `/sessions/${sessionId}/messages/send-bulk`, {
      messages: messages.map(m => ({ to: this.toWAId(m.phone), text: m.text })),
      delayMs,
    });
  }

  /** Send to a WhatsApp group (groupId ends in @g.us) */
  sendGroup(sessionId, groupId, text) {
    return this._req('POST', `/sessions/${sessionId}/messages/send-text`, {
      to: groupId, text,
    });
  }

  // ── Templates ───────────────────────────────────────────────────────────

  /**
   * Create a reusable message template.
   * Use {{variable_name}} in body for dynamic substitution.
   */
  createTemplate(sessionId, { name, header, body, footer }) {
    return this._req('POST', `/sessions/${sessionId}/templates`, { name, header, body, footer });
  }

  getTemplates(sessionId) { return this._req('GET', `/sessions/${sessionId}/templates`); }

  // ── Webhooks ────────────────────────────────────────────────────────────

  addWebhook(sessionId, url, events = ['message.received', 'message.status', 'session.status'], secret = '') {
    const body = { url, events };
    if (secret) body.secret = secret;
    return this._req('POST', `/sessions/${sessionId}/webhooks`, body);
  }

  // ── Health ──────────────────────────────────────────────────────────────
  health() { return this._req('GET', '/health/ready'); }
}

module.exports = new ZetuClient();
module.exports.ZetuClient = ZetuClient;

/*
─────────────────────────────────────────────────────────────
USAGE EXAMPLES FOR YOUR PROJECTS
─────────────────────────────────────────────────────────────

// ── CBC School ERP ──────────────────────────────────────────
const wa = require('./zetu-sdk');

// One-off fee reminder
await wa.sendText('school-erp', '0712345678', 'Fee balance: KES 5,000. Due 30 June.');

// Template-based bulk reminder
await wa.createTemplate('school-erp', {
  name: 'fee_reminder',
  header: 'Fee Reminder',
  body: 'Dear {{parent_name}}, {{student_name}} owes KES {{amount}} by {{due_date}}.',
  footer: 'School Finance Office',
});
await wa.sendTemplate('school-erp', '0712345678', 'fee_reminder', {
  parent_name: 'Mary Wanjiku', student_name: 'Brian', amount: '5,000', due_date: '30 June',
});

// Bulk blast
await wa.sendBulk('school-erp', [
  { phone: '0712345678', text: 'Reminder: KES 5,000 due Friday.' },
  { phone: '0723456789', text: 'Reminder: KES 3,200 due Friday.' },
]);

// ── House Hunt Kisii ────────────────────────────────────────
const { ZetuClient } = require('./zetu-sdk');
const wa = new ZetuClient(process.env.OPENWA_URL, process.env.OPENWA_API_KEY);

await wa.sendMedia('househunt-wa', buyer.phone,
  property.images[0],
  `🏠 New in ${property.area}!\n${property.beds}BR - KES ${property.price}/mo\nBook: ${listingUrl}`
);

// ── Sokoni Kenya ────────────────────────────────────────────
await wa.sendText('sokoni-wa', order.buyerPhone,
  `✅ Order #${order.id} confirmed!\nTotal: KES ${order.total}\nTrack: ${trackUrl}`
);

// ── Kadem Earning Platform ──────────────────────────────────
await wa.sendText('kadem-wa', member.phone,
  `💰 Withdrawal of KES ${amount} approved! M-Pesa to ${member.mpesaPhone} within 24hrs.`
);
─────────────────────────────────────────────────────────────
*/
