/**
 * Typed error hierarchy for the Zetu SDK.
 *
 * The Zetu API returns NestJS-default errors of the shape:
 *   `{ statusCode: number, message: string | string[], error: string }`
 * This module maps that to a typed, ergonomic error tree so callers can
 * `instanceof`-check or branch on `.status`.
 *
 * @packageDocumentation
 */

/** Base class for every error thrown by the SDK. */
export class ZetuError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZetuError';
  }
}

/**
 * Thrown when the API responds with a non-2xx status. Carries the HTTP status
 * code and the parsed error body (or the raw text if the body was not JSON).
 *
 * Use the static {@link ZetuApiError.fromResponse} factory in most cases.
 */
export class ZetuApiError extends ZetuError {
  /** HTTP status code (e.g. 400, 404, 409, 429, 501). */
  readonly status: number;
  /** Parsed JSON body if available, otherwise the raw response text. */
  readonly body: unknown;
  /** Value of the `error` field in the NestJS error envelope, if present. */
  readonly errorKind?: string;

  constructor(message: string, status: number, body: unknown, errorKind?: string) {
    super(message);
    this.name = 'ZetuApiError';
    this.status = status;
    this.body = body;
    this.errorKind = errorKind;
  }

  /** Build an {@link ZetuApiError} from a fetch Response, awaiting its body. */
  static async fromResponse(res: Response, context: string): Promise<ZetuApiError> {
    let body: unknown = undefined;
    const text = await res.text().catch(() => '');
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const env = isNestEnvelope(body) ? body : undefined;
    const messageText = describeMessage(env?.message ?? body ?? res.statusText);
    const message = `Zetu API ${res.status} ${res.statusText} — ${context}: ${messageText}`;
    return new ZetuApiError(message, res.status, body, env?.error);
  }
}

/** 401 Unauthorized — missing or invalid API key. */
export class ZetuAuthError extends ZetuApiError {}
/** 403 Forbidden — the API key's role is insufficient for this endpoint. */
export class ZetuForbiddenError extends ZetuApiError {}
/** 404 Not Found. */
export class ZetuNotFoundError extends ZetuApiError {}
/** 409 Conflict — typically an {@link EngineNotReadyError} from the backend. */
export class ZetuConflictError extends ZetuApiError {}
/** 429 Too Many Requests — rate limited. */
export class ZetuRateLimitError extends ZetuApiError {}
/** 501 Not Implemented — the active engine does not support this operation. */
export class ZetuNotImplementedError extends ZetuApiError {}

/** Thrown when a request exceeds the configured timeout. */
export class ZetuTimeoutError extends ZetuError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'ZetuTimeoutError';
  }
}

/**
 * Construct the most specific {@link ZetuApiError} subclass for a status code.
 * Falls back to the generic {@link ZetuApiError} for unmapped statuses.
 */
export function classifyApiError(status: number, message: string, body: unknown, errorKind?: string): ZetuApiError {
  switch (status) {
    case 401:
      return new ZetuAuthError(message, status, body, errorKind);
    case 403:
      return new ZetuForbiddenError(message, status, body, errorKind);
    case 404:
      return new ZetuNotFoundError(message, status, body, errorKind);
    case 409:
      return new ZetuConflictError(message, status, body, errorKind);
    case 429:
      return new ZetuRateLimitError(message, status, body, errorKind);
    case 501:
      return new ZetuNotImplementedError(message, status, body, errorKind);
    default:
      return new ZetuApiError(message, status, body, errorKind);
  }
}

/** Narrow the NestJS error envelope shape: `{ statusCode, message, error }`. */
interface NestErrorEnvelope {
  statusCode: number;
  message: string | string[];
  error: string;
}

function isNestEnvelope(body: unknown): body is NestErrorEnvelope {
  return typeof body === 'object' && body !== null && 'statusCode' in body && 'message' in body && 'error' in body;
}

function describeMessage(message: string | string[] | unknown): string {
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string') return message;
  return String(message);
}
