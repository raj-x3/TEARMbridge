// src/lib/server/paypal/client.ts
/**
 * Official PayPal Sandbox REST API Client.
 *
 * Requirements:
 * - Sandbox base URL: https://api-m.sandbox.paypal.com
 * - Strict prohibition of live/production payment mode
 * - OAuth 2.0 client-credentials token management with in-memory caching and proactive refresh
 * - Transient error bounded retry (5xx only, max 3 attempts)
 * - Safe error masking (never log or leak client secret or access tokens)
 * - Support for idempotent requests via PayPal-Request-Id header
 * - Documented verification of incoming webhooks via /v1/notifications/verify-webhook-signature
 */

export class PayPalError extends Error {
  public readonly statusCode: number;
  public readonly safeCode: string;
  public readonly details?: unknown;

  constructor(message: string, safeCode = "PAYPAL_ERROR", statusCode = 500, details?: unknown) {
    super(message);
    this.name = "PayPalError";
    this.statusCode = statusCode;
    this.safeCode = safeCode;
    this.details = details;
  }
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

let cachedOAuthToken: CachedToken | null = null;

const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;

/**
 * Checks whether PayPal Sandbox credentials are configured in the environment.
 */
export function isPayPalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET &&
    process.env.PAYPAL_CLIENT_ID.trim().length > 0 &&
    process.env.PAYPAL_CLIENT_SECRET.trim().length > 0
  );
}

/**
 * Enforces server-side security invariants:
 * - Live mode is strictly prohibited.
 * - Credentials must exist.
 */
function validatePayPalEnvironment(): { clientId: string; clientSecret: string } {
  const enableLive = process.env.PAYPAL_ENABLE_LIVE_MODE === "true";
  const envMode = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();

  if (enableLive || envMode === "live" || envMode === "production") {
    throw new PayPalError(
      "Live payment mode is strictly prohibited in this environment.",
      "LIVE_MODE_PROHIBITED",
      403
    );
  }

  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new PayPalError(
      "PayPal Sandbox credentials are not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
      "PAYPAL_NOT_CONFIGURED",
      503
    );
  }

  return { clientId, clientSecret };
}

/**
 * Retrieves a valid OAuth 2.0 access token using client_credentials grant.
 * Caches tokens until 60 seconds before expiration.
 */
export async function getPayPalAccessToken(forceRefresh = false): Promise<string> {
  const { clientId, clientSecret } = validatePayPalEnvironment();

  const now = Date.now();
  if (!forceRefresh && cachedOAuthToken && cachedOAuthToken.expiresAtMs > now + 60000) {
    return cachedOAuthToken.token;
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const response = await fetch(`${SANDBOX_BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials&scope=https://uri.paypal.com/services/invoicing https://uri.paypal.com/services/applications/webhooks",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const status = response.status;
      let safeMessage = "Failed to obtain PayPal OAuth token";
      if (status === 401) {
        safeMessage = "PayPal authentication failed: Invalid Client ID or Client Secret";
      }
      throw new PayPalError(safeMessage, "OAUTH_FAILED", status);
    }

    const data = await response.json();
    if (!data.access_token || typeof data.access_token !== "string") {
      throw new PayPalError("Malformed OAuth response from PayPal", "MALFORMED_OAUTH_RESPONSE", 502);
    }

    const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : 3600;
    cachedOAuthToken = {
      token: data.access_token,
      expiresAtMs: now + expiresInSec * 1000,
    };

    return cachedOAuthToken.token;
  } catch (err: unknown) {
    if (err instanceof PayPalError) throw err;
    const msg = err instanceof Error ? err.message : "Unknown error during OAuth token exchange";
    throw new PayPalError(`PayPal OAuth exchange error: ${msg}`, "OAUTH_NETWORK_ERROR", 502);
  }
}

/**
 * Reset token cache (useful for testing or after authentication invalidation).
 */
export function resetTokenCache(): void {
  cachedOAuthToken = null;
}

export interface PayPalRequestOptions {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  requestId?: string;
  retryCount?: number;
}

/**
 * Execute an authenticated HTTP request to the PayPal Sandbox API.
 * Includes automatic retry on transient 5xx responses with bounded exponential backoff.
 */
export async function paypalRequest<T>(options: PayPalRequestOptions): Promise<T> {
  const {
    endpoint,
    method = "GET",
    body,
    headers: customHeaders = {},
    requestId,
    retryCount = 0,
  } = options;

  const token = await getPayPalAccessToken();

  const url = endpoint.startsWith("http") ? endpoint : `${SANDBOX_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...customHeaders,
  };

  if (requestId && method === "POST") {
    headers["PayPal-Request-Id"] = requestId;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (networkError: unknown) {
    if (retryCount < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, Math.pow(2, retryCount) * 500));
      return paypalRequest<T>({ ...options, retryCount: retryCount + 1 });
    }
    const msg = networkError instanceof Error ? networkError.message : "Network failure";
    throw new PayPalError(`PayPal API network request failed: ${msg}`, "NETWORK_ERROR", 504);
  }

  // Handle transient server errors (500, 503) with retry
  if ((response.status === 500 || response.status === 503) && retryCount < MAX_RETRIES) {
    await new Promise((r) => setTimeout(r, Math.pow(2, retryCount) * 500));
    return paypalRequest<T>({ ...options, retryCount: retryCount + 1 });
  }

  // 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const responseText = await response.text();
  let responseData: unknown = null;
  if (responseText) {
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }
  }

  if (!response.ok) {
    const errorDetails = responseData as { message?: string; name?: string; details?: unknown };
    const safeMsg = errorDetails?.message || `PayPal API request failed with status ${response.status}`;
    const safeCode = errorDetails?.name || `PAYPAL_${response.status}`;
    throw new PayPalError(safeMsg, safeCode, response.status, errorDetails?.details);
  }

  return responseData as T;
}

// ----------------------------------------------------------------------------
// High-Level PayPal Invoicing API Methods
// ----------------------------------------------------------------------------

export interface PayPalCreateInvoiceResponse {
  id: string;
  status: string;
  rel?: string;
  href?: string;
  [key: string]: unknown;
}

/**
 * Creates a draft invoice in PayPal Sandbox via POST /v2/invoicing/invoices.
 * Uses a stable PayPal-Request-Id to guarantee idempotency.
 */
export async function createDraftInvoice(
  payload: Record<string, unknown>,
  requestId: string
): Promise<PayPalCreateInvoiceResponse> {
  const result = await paypalRequest<PayPalCreateInvoiceResponse>({
    endpoint: "/v2/invoicing/invoices",
    method: "POST",
    body: payload,
    requestId,
  });

  // PayPal response often returns a HATEOAS link with invoice ID or direct invoice object
  let invoiceId = result.id;
  if (!invoiceId && result.href) {
    const match = result.href.match(/\/invoices\/([A-Za-z0-9_-]+)/);
    if (match) {
      invoiceId = match[1];
    }
  }

  return {
    ...result,
    id: invoiceId,
  };
}

/**
 * Retrieves authoritative invoice details from PayPal via GET /v2/invoicing/invoices/{invoice_id}.
 */
export async function getInvoice(invoiceId: string): Promise<Record<string, unknown>> {
  return paypalRequest<Record<string, unknown>>({
    endpoint: `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`,
    method: "GET",
  });
}

/**
 * Sends a draft invoice to the buyer via POST /v2/invoicing/invoices/{invoice_id}/send.
 * PayPal documents send options: send_to_recipient (true), send_to_invoicer (false).
 */
export async function sendInvoice(
  invoiceId: string,
  requestId?: string
): Promise<Record<string, unknown>> {
  return paypalRequest<Record<string, unknown>>({
    endpoint: `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`,
    method: "POST",
    body: {
      send_to_recipient: true,
      send_to_invoicer: false,
    },
    requestId,
  });
}

export interface VerifyWebhookSignatureParams {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId: string;
  webhookEvent: Record<string, unknown>;
}

/**
 * Verifies the authenticity of an incoming PayPal webhook using PayPal's
 * POST /v1/notifications/verify-webhook-signature API.
 */
export async function verifyWebhookSignature(
  params: VerifyWebhookSignatureParams
): Promise<boolean> {
  const {
    authAlgo,
    certUrl,
    transmissionId,
    transmissionSig,
    transmissionTime,
    webhookId,
    webhookEvent,
  } = params;

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime || !webhookId) {
    return false;
  }

  try {
    const response = await paypalRequest<{ verification_status: string }>({
      endpoint: "/v1/notifications/verify-webhook-signature",
      method: "POST",
      body: {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: webhookEvent,
      },
    });

    return response.verification_status === "SUCCESS";
  } catch (err) {
    console.error("[PayPal Webhook Verification Error]:", err);
    return false;
  }
}
