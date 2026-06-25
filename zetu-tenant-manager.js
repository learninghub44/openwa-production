#!/usr/bin/env node
/**
 * Zetu Tenant Manager CLI
 * Manages WhatsApp sessions and API keys per client.
 *
 * Usage:
 *   OPENWA_URL=https://your-zetu.onrender.com \
 *   OPENWA_MASTER_KEY=your_master_key \
 *   node tenant-manager.js
 */

const BASE_URL = (process.env.OPENWA_URL || 'https://your-zetu.onrender.com').replace(/\/$/, '');
const MASTER_KEY = process.env.OPENWA_MASTER_KEY || '';

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': MASTER_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function listSessions() {
  const sessions = await api('GET', '/sessions');
  if (!sessions?.length) { console.log('\n  No sessions yet.\n'); return; }
  console.log('\n  Sessions:');
  console.table(sessions.map(s => ({ ID: s.id, Name: s.name || '—', Status: s.status })));
}

async function addTenant() {
  console.log('\n--- Add New Tenant ---');
  const id = (await ask('Session ID (e.g. client-acme, no spaces): ')).trim();
  const name = (await ask('Client/business name: ')).trim();
  const keyName = (await ask('API key label (e.g. acme-key): ')).trim();

  process.stdout.write('Creating session...');
  await api('POST', '/sessions', { id, name, autoReconnect: true, engine: 'baileys' });
  console.log(' ✓');

  process.stdout.write('Starting session...');
  await api('POST', `/sessions/${id}/start`);
  console.log(' ✓');

  process.stdout.write('Creating scoped API key...');
  const key = await api('POST', '/auth/api-keys', { name: keyName, role: 'operator', allowedSessions: [id] });
  console.log(' ✓');

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  ✅ TENANT ONBOARDED                                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Session ID : ${id}`);
  console.log(`  Client     : ${name}`);
  console.log(`  API Key    : ${key.key}`);
  console.log(`  QR URL     : ${BASE_URL}/api/sessions/${id}/qr`);
  console.log('\n  ⚠  Give the client their API Key + QR URL.');
  console.log('     They open the QR URL in a browser and scan with WhatsApp → Linked Devices.\n');
}

async function removeTenant() {
  await listSessions();
  const id = (await ask('Session ID to remove: ')).trim();
  const confirm = (await ask(`Delete "${id}" and all its data? (yes/no): `)).trim();
  if (confirm !== 'yes') { console.log('Cancelled.'); return; }
  await api('DELETE', `/sessions/${id}`);
  console.log(`✓ Session "${id}" deleted.`);
}

async function listKeys() {
  const keys = await api('GET', '/auth/api-keys');
  if (!keys?.length) { console.log('\n  No API keys.\n'); return; }
  console.log('\n  API Keys:');
  console.table(keys.map(k => ({
    ID: k.id, Name: k.name, Role: k.role,
    Sessions: (k.allowedSessions || []).join(', ') || '(all)',
    Active: k.active,
  })));
}

async function revokeKey() {
  await listKeys();
  const id = (await ask('API Key ID to revoke: ')).trim();
  await api('POST', `/auth/api-keys/${id}/revoke`);
  console.log(`✓ Key revoked.`);
}

async function getQR() {
  await listSessions();
  const id = (await ask('Session ID: ')).trim();
  console.log(`\n  QR URL: ${BASE_URL}/api/sessions/${id}/qr`);
  console.log('  Open in browser → scan with WhatsApp → Linked Devices.\n');
}

async function addWebhook() {
  await listSessions();
  const id = (await ask('Session ID: ')).trim();
  const url = (await ask('Your webhook URL: ')).trim();
  const eventsInput = (await ask('Events (Enter for defaults: message.received,session.status): ')).trim();
  const secret = (await ask('HMAC secret (optional, Enter to skip): ')).trim();
  const events = eventsInput ? eventsInput.split(',').map(e => e.trim()) : ['message.received', 'message.status', 'session.status'];
  const body = { url, events };
  if (secret) body.secret = secret;
  const wh = await api('POST', `/sessions/${id}/webhooks`, body);
  console.log(`\n✅ Webhook created! ID: ${wh.id}`);
}

async function sendTest() {
  await listSessions();
  const id = (await ask('Session ID: ')).trim();
  const phone = (await ask('Phone number (e.g. 254712345678): ')).trim();
  const text = (await ask('Message: ')).trim();
  const to = `${phone.replace(/^\+/, '')}@s.whatsapp.net`;
  await api('POST', `/sessions/${id}/messages/send-text`, { to, text });
  console.log('✅ Message sent!');
}

async function createTemplate() {
  await listSessions();
  const id = (await ask('Session ID: ')).trim();
  const name = (await ask('Template name (e.g. fee_reminder): ')).trim();
  const header = (await ask('Header text: ')).trim();
  const body = (await ask('Body text (use {{variable}} for placeholders): ')).trim();
  const footer = (await ask('Footer text (optional): ')).trim();
  await api('POST', `/sessions/${id}/templates`, { name, header, body, footer });
  console.log(`✅ Template "${name}" created!`);
}

async function main() {
  if (!MASTER_KEY) {
    console.error('\n❌ OPENWA_MASTER_KEY not set.');
    console.error('   Run: OPENWA_URL=https://... OPENWA_MASTER_KEY=... node tenant-manager.js\n');
    rl.close(); return;
  }
  console.log('\n╔════════════════════════════════╗');
  console.log('║   Zetu Tenant Manager        ║');
  console.log('╚════════════════════════════════╝');
  console.log(`  Server: ${BASE_URL}\n`);
  try {
    const h = await api('GET', '/health/ready');
    console.log(`  Health: ${h.status === 'ok' ? '✅ Online' : '❌ ' + JSON.stringify(h)}\n`);
  } catch (e) {
    console.error('  ❌ Cannot reach server. Check OPENWA_URL.\n');
    rl.close(); return;
  }

  while (true) {
    console.log('  1. List sessions');
    console.log('  2. Add new tenant (session + API key + QR)');
    console.log('  3. Remove tenant');
    console.log('  4. List API keys');
    console.log('  5. Revoke API key');
    console.log('  6. Get QR code URL');
    console.log('  7. Add webhook to session');
    console.log('  8. Create message template');
    console.log('  9. Send test message');
    console.log('  0. Exit');
    const c = (await ask('\n  Choose: ')).trim();
    console.log('');
    try {
      if (c === '1') await listSessions();
      else if (c === '2') await addTenant();
      else if (c === '3') await removeTenant();
      else if (c === '4') await listKeys();
      else if (c === '5') await revokeKey();
      else if (c === '6') await getQR();
      else if (c === '7') await addWebhook();
      else if (c === '8') await createTemplate();
      else if (c === '9') await sendTest();
      else if (c === '0') { console.log('Goodbye!\n'); rl.close(); return; }
      else console.log('  Invalid choice.\n');
    } catch (e) { console.error('  ❌ Error:', e.message, '\n'); }
  }
}

main().catch(e => { console.error(e); rl.close(); });
