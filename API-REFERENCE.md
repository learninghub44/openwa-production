# Zetu API Quick Reference

**Base URL:** `https://your-openwa.onrender.com/api`  
**Auth header:** `X-API-Key: YOUR_KEY`  
**Interactive docs:** `/api/docs` (Swagger UI)

---

## Sessions
```
GET    /sessions                        List all sessions
POST   /sessions                        Create session
GET    /sessions/:id                    Get session details & status
POST   /sessions/:id/start              Start session (generates QR)
POST   /sessions/:id/stop               Stop session
GET    /sessions/:id/qr                 QR code image (open in browser to scan)
DELETE /sessions/:id                    Delete session + all data
GET    /sessions/:id/chats              List chats
GET    /sessions/:id/contacts           List contacts
```

### Create session body
```json
{ "id": "client-acme", "name": "Acme Business", "autoReconnect": true }
```

---

## Messages
```
POST /sessions/:id/messages/send-text       Send text
POST /sessions/:id/messages/send-media      Send image / document
POST /sessions/:id/messages/send-template   Send saved template
POST /sessions/:id/messages/send-bulk       Bulk send with delay
POST /sessions/:id/messages/reply           Reply quoting a message
POST /sessions/:id/messages/react           React with emoji
GET  /sessions/:id/messages                 Message history
```

### Send text
```json
{ "to": "254712345678@s.whatsapp.net", "text": "Hello!" }
```

### Send image
```json
{ "to": "254712345678@s.whatsapp.net", "url": "https://...", "caption": "Look!" }
```

### Send document
```json
{ "to": "254712345678@s.whatsapp.net", "url": "https://.../file.pdf", "filename": "Invoice.pdf" }
```

### Send template
```json
{ "to": "254712345678@s.whatsapp.net", "templateName": "fee_reminder", "variables": { "name": "Mary" } }
```

### Bulk send
```json
{
  "messages": [
    { "to": "254712345678@s.whatsapp.net", "text": "Hi there" },
    { "to": "254723456789@s.whatsapp.net", "text": "Hi there" }
  ],
  "delayMs": 2000
}
```

---

## Templates
```
GET    /sessions/:id/templates           List templates
POST   /sessions/:id/templates           Create template
DELETE /sessions/:id/templates/:name     Delete template
```

### Create template
```json
{
  "name": "fee_reminder",
  "header": "Fee Reminder",
  "body": "Dear {{parent_name}}, fees of KES {{amount}} due {{due_date}}.",
  "footer": "School Finance Office"
}
```

---

## Webhooks
```
GET    /sessions/:id/webhooks              List webhooks
POST   /sessions/:id/webhooks              Create webhook
PUT    /sessions/:id/webhooks/:webhookId   Update webhook
DELETE /sessions/:id/webhooks/:webhookId   Delete webhook
```

### Create webhook
```json
{
  "url": "https://your-app.com/webhooks/whatsapp",
  "events": ["message.received", "message.status", "session.status"],
  "secret": "optional-hmac-secret"
}
```

### Incoming event payload
```json
{
  "event": "message.received",
  "sessionId": "client-acme",
  "timestamp": 1719320400000,
  "data": {
    "id": "msg_abc123",
    "from": "254712345678@s.whatsapp.net",
    "body": "Hello!",
    "type": "text",
    "fromMe": false
  }
}
```

**Event types:** `message.received` | `message.status` | `session.status` | `session.qr`

---

## API Keys (master key only)
```
GET    /auth/api-keys              List all keys
POST   /auth/api-keys              Create key
POST   /auth/api-keys/:id/revoke   Revoke key
DELETE /auth/api-keys/:id          Delete key
```

### Create scoped key for a tenant
```json
{
  "name": "Acme Client Key",
  "role": "operator",
  "allowedSessions": ["client-acme"],
  "expiresAt": "2027-12-31T00:00:00Z"
}
```

| Role | Can do |
|------|--------|
| `admin` | Everything — create keys, infra settings |
| `operator` | Send/receive, manage sessions & webhooks |
| `viewer` | Read-only |

---

## Groups
```
GET  /sessions/:id/groups                            List groups
POST /sessions/:id/groups                            Create group
POST /sessions/:id/groups/:groupId/participants      Add members
```

### Send to group
```json
{ "to": "GROUP_ID@g.us", "text": "Hello group!" }
```

---

## Health & Stats
```
GET /health/ready      → { "status": "ok" }
GET /health/live       → { "status": "ok" }
GET /stats/sessions
GET /stats/overview
```

---

## Kenyan phone number format

```
Input:   0712 345 678
Step 1:  digits only   → 0712345678
Step 2:  strip 0 add 254 → 254712345678
Step 3:  append suffix → 254712345678@s.whatsapp.net

Groups:  254712345678-1234567890@g.us
```
