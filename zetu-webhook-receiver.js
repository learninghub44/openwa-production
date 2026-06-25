/**
 * Zetu Webhook Receiver
 * Add to any of your existing Node.js/Express backends to receive WhatsApp events.
 *
 * Install: npm install express
 * Run:     WEBHOOK_SECRET=your_secret node webhook-receiver.js
 *
 * Or mount the router in your existing Express app:
 *   const { whatsappRouter } = require('./webhook-receiver');
 *   app.use('/webhooks', whatsappRouter);
 */

const express = require('express');
const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const PORT = process.env.PORT || 3001;

// ── Signature verification ────────────────────────────────────────────────────
function verifySignature(req, rawBody) {
  if (!WEBHOOK_SECRET) return true;
  const sig = req.headers['x-zetu-signature'];
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); }
  catch { return false; }
}

// ── Router (export this to mount in your existing app) ────────────────────────
const whatsappRouter = express.Router();

whatsappRouter.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

whatsappRouter.post('/whatsapp', (req, res) => {
  if (!verifySignature(req, req.rawBody)) {
    console.warn('⚠️  Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  res.status(200).json({ received: true }); // respond fast, process async
  handleEvent(req.body).catch(e => console.error('Webhook handler error:', e));
});

// ── Event dispatcher ──────────────────────────────────────────────────────────
async function handleEvent({ event, sessionId, data }) {
  switch (event) {
    case 'message.received':   return onMessageReceived(sessionId, data);
    case 'message.status':     return onMessageStatus(sessionId, data);
    case 'session.status':     return onSessionStatus(sessionId, data);
    default: console.log(`[${sessionId}] event: ${event}`);
  }
}

// ── Handlers — put YOUR business logic here ───────────────────────────────────

async function onMessageReceived(sessionId, msg) {
  const from = msg.from?.replace(/@.*/, '');
  console.log(`📩 [${sessionId}] from ${from}: ${msg.body || '(media)'}`);

  /*
  ── CBC School ERP ───────────────────────────────────────────────────────
  if (sessionId === 'school-erp') {
    if (msg.body?.toLowerCase().startsWith('balance')) {
      const student = await db.getStudentByPhone(from);
      const balance = await db.getFeeBalance(student.id);
      await sendReply(sessionId, msg.from, `Hi ${student.parentName}, balance: KES ${balance}`);
    }
  }

  ── House Hunt Kisii ─────────────────────────────────────────────────────
  if (sessionId === 'househunt-wa') {
    await supabase.from('whatsapp_inquiries').insert({ phone: from, message: msg.body });
    await sendReply(sessionId, msg.from, '👋 Thanks! An agent will contact you shortly.');
  }

  ── Sokoni Kenya ─────────────────────────────────────────────────────────
  if (sessionId === 'sokoni-wa') {
    // log inquiry, trigger AI response, etc.
  }

  ── Kadem Earning Platform ───────────────────────────────────────────────
  if (sessionId === 'kadem-wa') {
    if (msg.body?.toLowerCase() === 'balance') {
      const member = await db.getMemberByPhone(from);
      await sendReply(sessionId, msg.from, `💰 Your balance: KES ${member.balance}`);
    }
  }

  ── AI auto-reply (Groq) ─────────────────────────────────────────────────
  const reply = await groq.chat.completions.create({
    model: 'llama3-8b-8192',
    messages: [{ role: 'user', content: msg.body }],
  });
  await sendReply(sessionId, msg.from, reply.choices[0].message.content);
  */
}

async function onMessageStatus(sessionId, data) {
  // data.status: sent | delivered | read | failed
  console.log(`[${sessionId}] msg ${data.messageId} → ${data.status}`);
}

async function onSessionStatus(sessionId, data) {
  console.log(`[${sessionId}] session → ${data.status}`);
  if (data.status === 'disconnected') {
    console.warn(`⚠️  [${sessionId}] DISCONNECTED — needs re-scan`);
    // TODO: notify admin via email / SMS
  }
  if (data.status === 'qr_ready') {
    const url = `${process.env.OPENWA_URL}/api/sessions/${sessionId}/qr`;
    console.log(`[${sessionId}] QR ready: ${url}`);
    // TODO: email QR URL to client
  }
}

// ── Helper: send reply back via Zetu ────────────────────────────────────────
async function sendReply(sessionId, to, text) {
  await fetch(`${process.env.OPENWA_URL}/api/sessions/${sessionId}/messages/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.OPENWA_API_KEY },
    body: JSON.stringify({ to, text }),
  });
}

module.exports = { whatsappRouter, handleEvent };

// ── Standalone mode ───────────────────────────────────────────────────────────
if (require.main === module) {
  const app = express();
  app.use('/webhooks', whatsappRouter);
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.listen(PORT, () => {
    console.log(`🚀 Webhook receiver on http://localhost:${PORT}/webhooks/whatsapp`);
    if (!WEBHOOK_SECRET) console.warn('⚠️  No WEBHOOK_SECRET — signature check disabled');
  });
}
