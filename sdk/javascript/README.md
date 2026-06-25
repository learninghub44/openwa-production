# @learninghub44/zetu

Official JavaScript/TypeScript SDK for the [Zetu](https://github.com/learninghub44/Zetu) WhatsApp API Gateway.

Ships dual CJS + ESM builds with bundled type declarations.

## Install

```bash
npm install @learninghub44/zetu
```

Requires Node.js >= 18 (relies on the global `fetch`).

## Usage

```typescript
import { ZetuClient } from '@learninghub44/zetu';

const client = new ZetuClient({
  baseUrl: 'https://your-gateway.example.com',
  apiKey: 'owa_k1_…',
});

await client.sessions.start('my-session');

const result = await client.messages.sendText('my-session', {
  chatId: '628123456789@c.us',
  text: 'Hello from the Zetu SDK!',
});
console.log(result.messageId);
```

CommonJS consumers use `require('@learninghub44/zetu')` identically.

## Errors

Non-2xx responses throw a typed `ZetuApiError` subclass
(`ZetuAuthError`, `ZetuForbiddenError`, `ZetuNotFoundError`,
`ZetuConflictError`, `ZetuRateLimitError`, `ZetuNotImplementedError`),
each carrying `.status` and the parsed `.body`. Timeouts throw
`ZetuTimeoutError`. The SDK does **not** retry — wrap calls with your own
backoff if needed.

## License

MIT
