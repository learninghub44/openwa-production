#!/usr/bin/env node
/**
 * Zetu Tenant Manager CLI  (multi-tenant edition)
 * Manages tenants, WhatsApp sessions and API keys.
 *
 * Usage:
 *   OPENWA_URL=https://your-zetu.onrender.com \
 *   OPENWA_MASTER_KEY=your_master_key \
 *   node zetu-tenant-manager.js
 */

const BASE_URL  = (process.env.OPENWA_URL     || 'https://your-zetu.onrender.com').replace(/\/$/, '');
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

// ── Tenant operations ────────────────────────────────────────────────────────

async function provisionTenant() {
  console.log('\n--- Provision New Tenant (Fully Automated) ---');
  const name  = (await ask('Business / client name:                ')).trim();
  const slug  = (await ask('Slug (lowercase, hyphens, e.g. acme-corp): ')).trim();
  const email = (await ask('Contact email (optional, Enter to skip):   ')).trim();
  const planIn= (await ask('Plan [free/starter/pro/enterprise] (Enter=starter): ')).trim();
  const plan  = ['free','starter','pro','enterprise'].includes(planIn) ? planIn : 'starter';

  console.log('\n  Provisioning tenant, session, and API key…');
  const result = await api('POST', '/tenants', {
    name, slug, email: email || undefined, plan,
    autoStart: true,
  });

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅  TENANT PROVISIONED                                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Tenant ID  : ${result.id}`);
  console.log(`  Name       : ${result.name}`);
  console.log(`  Slug       : ${result.slug}`);
  console.log(`  Plan       : ${result.plan}`);
  console.log(`  Session ID : ${result.sessionId}`);
  console.log(`  API Key ID : ${result.apiKeyId}`);
  console.log(`\n  🔑 API KEY (save this — shown ONCE):`);
  console.log(`     ${result.apiKey}`);
  console.log(`\n  📱 QR URL (share with client to link WhatsApp):`);
  console.log(`     ${result.qrUrl}`);
  console.log(`\n  Session started: ${result.sessionStarted ? '✅ Yes' : '⚠️  No (start manually)'}`);
  console.log('');
}

async function listTenants() {
  const tenants = await api('GET', '/tenants');
  if (!tenants?.length) { console.log('\n  No tenants yet.\n'); return; }
  console.log('\n  Tenants:');
  console.table(tenants.map(t => ({
    ID: t.id.slice(0,8)+'…', Name: t.name, Slug: t.slug,
    Plan: t.plan, Active: t.isActive,
  })));
}

async function deactivateTenant() {
  await listTenants();
  const id = (await ask('Tenant ID to deactivate: ')).trim();
  await api('PUT', `/tenants/${id}`, { isActive: false });
  console.log('✓ Tenant deactivated.');
}

async function deleteTenant() {
  await listTenants();
  const id      = (await ask('Tenant ID to delete:         ')).trim();
  const confirm = (await ask(`Delete tenant ${id}? (yes/no): `)).trim();
  if (confirm !== 'yes') { console.log('Cancelled.'); return; }
  // Stop + delete the associated session first
  const sessions = await api('GET', '/sessions');
  const tenantSessions = sessions.filter(s => {
    try { return (s.config?.tenantId === id); } catch { return false; }
  });
  for (const s of tenantSessions) {
    try {
      await api('POST', `/sessions/${s.id}/stop`);
      await api('DELETE', `/sessions/${s.id}`);
      console.log(`  ✓ Deleted session: ${s.name}`);
    } catch (e) { console.warn(`  ⚠ Could not delete session ${s.id}: ${e.message}`); }
  }
  await api('DELETE', `/tenants/${id}`);
  console.log(`✓ Tenant ${id} deleted.`);
}

// ── Session operations ───────────────────────────────────────────────────────

async function listSessions() {
  const sessions = await api('GET', '/sessions');
  if (!sessions?.length) { console.log('\n  No sessions yet.\n'); return; }
  console.log('\n  Sessions:');
  console.table(sessions.map(s => ({
    ID: s.id.slice(0,8)+'…', Name: s.name,
    Status: s.status,
    Tenant: s.config?.tenantSlug || '—',
    Phone: s.phone || '—',
  })));
}

async function startSession() {
  await listSessions();
  const id = (await ask('Session ID to start: ')).trim();
  await api('POST', `/sessions/${id}/start`);
  console.log('✓ Session start triggered. Watch status via /api/sessions/' + id);
}

async function stopSession() {
  await listSessions();
  const id = (await ask('Session ID to stop: ')).trim();
  await api('POST', `/sessions/${id}/stop`);
  console.log('✓ Stopped.');
}

// ── API Key operations ───────────────────────────────────────────────────────

async function listKeys() {
  const keys = await api('GET', '/auth/api-keys');
  if (!keys?.length) { console.log('\n  No API keys.\n'); return; }
  console.log('\n  API Keys:');
  console.table(keys.map(k => ({
    ID: k.id.slice(0,8)+'…', Name: k.name, Role: k.role,
    Sessions: (k.allowedSessions || []).join(', ') || '(all)',
    Active: k.isActive,
  })));
}

async function revokeKey() {
  await listKeys();
  const id = (await ask('API Key ID to revoke: ')).trim();
  await api('POST', `/auth/api-keys/${id}/revoke`);
  console.log('✓ Key revoked.');
}

// ── Webhook / messaging ──────────────────────────────────────────────────────

async function addWebhook() {
  await listSessions();
  const id     = (await ask('Session ID: ')).trim();
  const url    = (await ask('Webhook URL: ')).trim();
  const evIn   = (await ask('Events (Enter=defaults): ')).trim();
  const secret = (await ask('HMAC secret (optional): ')).trim();
  const events = evIn ? evIn.split(',').map(e => e.trim()) : ['message.received','message.status','session.status'];
  const body   = { url, events, ...(secret && { secret }) };
  const wh     = await api('POST', `/sessions/${id}/webhooks`, body);
  console.log(`✅ Webhook created! ID: ${wh.id}`);
}

async function sendTest() {
  await listSessions();
  const id    = (await ask('Session ID:               ')).trim();
  const phone = (await ask('Phone (e.g. 254712345678): ')).trim();
  const text  = (await ask('Message:                  ')).trim();
  const to    = `${phone.replace(/^\+/,'')}@s.whatsapp.net`;
  await api('POST', `/sessions/${id}/messages/send-text`, { to, text });
  console.log('✅ Message sent!');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!MASTER_KEY) {
    console.error('\n❌ OPENWA_MASTER_KEY not set.');
    console.error('   Run: OPENWA_URL=https://... OPENWA_MASTER_KEY=... node zetu-tenant-manager.js\n');
    rl.close(); return;
  }

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  Zetu Tenant Manager (multi-tenant)  ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  Server: ${BASE_URL}\n`);

  try {
    const h = await api('GET', '/health/ready');
    console.log(`  Health: ${h.status === 'ok' ? '✅ Online' : '❌ ' + JSON.stringify(h)}\n`);
  } catch {
    console.error('  ❌ Cannot reach server. Check OPENWA_URL.\n');
    rl.close(); return;
  }

  while (true) {
    console.log('  ── TENANTS ────────────────────────────────');
    console.log('  1.  Provision new tenant (automated: session + key + QR)');
    console.log('  2.  List tenants');
    console.log('  3.  Deactivate tenant');
    console.log('  4.  Delete tenant (stops session too)');
    console.log('  ── SESSIONS ───────────────────────────────');
    console.log('  5.  List sessions');
    console.log('  6.  Start session');
    console.log('  7.  Stop session');
    console.log('  ── API KEYS ───────────────────────────────');
    console.log('  8.  List API keys');
    console.log('  9.  Revoke API key');
    console.log('  ── MESSAGING ──────────────────────────────');
    console.log('  10. Add webhook to session');
    console.log('  11. Send test message');
    console.log('  0.  Exit');

    const c = (await ask('\n  Choose: ')).trim();
    console.log('');
    try {
      if      (c === '1')  await provisionTenant();
      else if (c === '2')  await listTenants();
      else if (c === '3')  await deactivateTenant();
      else if (c === '4')  await deleteTenant();
      else if (c === '5')  await listSessions();
      else if (c === '6')  await startSession();
      else if (c === '7')  await stopSession();
      else if (c === '8')  await listKeys();
      else if (c === '9')  await revokeKey();
      else if (c === '10') await addWebhook();
      else if (c === '11') await sendTest();
      else if (c === '0')  { console.log('Goodbye!\n'); rl.close(); return; }
      else console.log('  Invalid choice.\n');
    } catch (e) { console.error('  ❌ Error:', e.message, '\n'); }
  }
}

main().catch(e => { console.error(e); rl.close(); });
