# Zetu — Deploy to Render (No Docker)

## What this is
One Render service that runs all your clients' WhatsApp sessions.
Each client gets their own session + scoped API key — full isolation.

---

## Step 1 — Push to GitHub

1. Create a new **private** repo on GitHub (e.g. `learninghub44/openwa`)
2. Push this folder to it:
```bash
cd openwa-production
git init
git add .
git commit -m "Initial Zetu setup"
git remote add origin https://github.com/learninghub44/openwa.git
git push -u origin main
```

---

## Step 2 — Deploy on Render (Blueprint)

1. Go to https://dashboard.render.com
2. Click **New → Blueprint**
3. Connect your GitHub, select the repo → **Apply**
4. Render reads `render.yaml` and creates:
   - Web service (Node.js, Standard plan, 1GB RAM)
   - 5GB persistent disk at `/app/data`

**Build time:** ~4–6 min first deploy.

---

## Step 3 — Verify

```
https://your-openwa.onrender.com/api/health/ready
→ {"status":"ok"}

https://your-openwa.onrender.com/api/docs
→ Swagger UI
```

---

## Step 4 — Get Your Master Key

Render Dashboard → **openwa** service → **Environment** → copy `API_MASTER_KEY`.

Test:
```bash
curl -H "X-API-Key: YOUR_MASTER_KEY" https://your-openwa.onrender.com/api/sessions
# → []
```

---

## Step 5 — Add First Client (Tenant)

```bash
export OPENWA_URL=https://your-openwa.onrender.com
export OPENWA_MASTER_KEY=your_master_key

node zetu-tenant-manager.js
# → choose option 2 (Add new tenant)
```

You get back:
- A **scoped API key** (give to client)
- A **QR URL** (client opens in browser, scans with WhatsApp → Linked Devices)

---

## Step 6 — Register a Webhook

For each client, register your app's webhook URL:

```bash
curl -X POST https://your-openwa.onrender.com/api/sessions/SESSION_ID/webhooks \
  -H "X-API-Key: MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.onrender.com/webhooks/whatsapp",
    "events": ["message.received","session.status"],
    "secret": "your-hmac-secret"
  }'
```

Or use `zetu-tenant-manager.js` option 7.

Add `zetu-webhook-receiver.js` to your receiving app. It handles signature verification + routing.

---

## Step 7 — Integrate with Your Apps

Copy `zetu-sdk.js` into any of your projects:

```js
const wa = require('./openwa-sdk');

// CBC School ERP — fee reminder
await wa.sendText('school-erp', '0712345678', 'Fee balance: KES 5,000. Due 30 June.');

// House Hunt Kisii — property alert with image
await wa.sendMedia('househunt-wa', buyer.phone, property.imageUrl,
  `🏠 New: ${property.beds}BR in ${property.area} — KES ${property.price}/mo`);

// Sokoni Kenya — order confirmation
await wa.sendText('sokoni-wa', order.buyerPhone, `✅ Order #${order.id} confirmed!`);

// Kadem — withdrawal notification
await wa.sendText('kadem-wa', member.phone, `💰 KES ${amount} sent to M-Pesa ${member.phone}`);
```

---

## Multi-tenant layout

```
Zetu (single Render service)
├── session: school-erp     ← CBC ERP fee messages
│   API Key: owa_k1_aaa     ← scoped, only sees school-erp
├── session: househunt-wa   ← House Hunt property alerts
│   API Key: owa_k1_bbb
├── session: sokoni-wa      ← Sokoni order updates
│   API Key: owa_k1_ccc
└── session: kadem-wa       ← Kadem payouts
    API Key: owa_k1_ddd
```

---

## Upgrading to PostgreSQL

When you have 10+ sessions:

Render Dashboard → openwa → Environment → add:
```
DATABASE_TYPE=postgres
DATABASE_HOST=your-db.render.com
DATABASE_PORT=5432
DATABASE_USERNAME=openwa
DATABASE_PASSWORD=strong_password
DATABASE_NAME=openwa
DATABASE_SSL=true
```

Redeploy. Migrations run automatically.

---

## Costs (Render)

| What | Cost |
|------|------|
| Web service (Standard, 1GB) | $25/mo |
| Disk (5GB) | $1.25/mo |
| PostgreSQL Starter (optional) | $7/mo |
| **Total** | **~$26–$33/mo** |

Handles 20+ simultaneous WhatsApp sessions comfortably.

---

## Troubleshooting

**Build fails "nest not found"** → `buildCommand` must use `npm ci --include=dev` (already set in render.yaml)

**Sessions disconnect** → Normal on Baileys if phone goes offline. `autoReconnect: true` handles it.

**QR expired** → QR codes expire ~60s. Restart session:
```bash
curl -X POST https://your-openwa.onrender.com/api/sessions/SESSION_ID/start -H "X-API-Key: KEY"
```

**Data wiped on redeploy** → Render Disk must be mounted at `/app/data`. Check render.yaml `disk` section.

**No messages arriving** → Check session status. If `disconnected`, client needs to re-scan QR.
