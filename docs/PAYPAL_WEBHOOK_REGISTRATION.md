# PayPal Sandbox Webhook Registration Guide — TERMBridge Module 5

TERMBridge utilizes real, cryptographically-verified PayPal webhooks to automate the payment lifecycle without manual reconciliation.

## 1. Webhook Endpoint
The webhook handler in TERMBridge is located at:
```
POST /api/webhooks/paypal
```

When deployed to production or preview:
```
https://<YOUR_DEPLOYED_DOMAIN>/api/webhooks/paypal
```

For local development and testing, use a secure tunnel such as `ngrok`:
```bash
ngrok http 3000
# Endpoint: https://<your-subdomain>.ngrok-free.app/api/webhooks/paypal
```

---

## 2. Register Webhook via PayPal Developer Dashboard

1. Log in to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Select **Apps & Credentials** and choose your **Sandbox App** (e.g., `TERMBridge-Sandbox`).
3. Scroll down to **SandBox Webhooks** and click **Add Webhook**.
4. Enter your Webhook URL:
   `https://<YOUR_DOMAIN>/api/webhooks/paypal`
5. Under **Event Types**, subscribe to:
   - `Invoicing invoice created` (`INVOICING.INVOICE.CREATED`)
   - `Invoicing invoice sent` (`INVOICING.INVOICE.SENT`)
   - `Invoicing invoice updated` (`INVOICING.INVOICE.UPDATED`)
   - `Invoicing invoice paid` (`INVOICING.INVOICE.PAID`)
   - `Invoicing invoice cancelled` (`INVOICING.INVOICE.CANCELLED`)
   - `Invoicing invoice refunded` (`INVOICING.INVOICE.REFUNDED`)
6. Click **Save**.
7. Copy the generated **Webhook ID** (e.g., `WH-461329584V734910Y`).

---

## 3. Register Webhook via PayPal REST API (CLI Alternative)

You can also register the webhook programmatically using your sandbox client credentials:

```bash
# 1. Obtain sandbox access token
ACCESS_TOKEN=$(curl -s -X POST "https://api-m.sandbox.paypal.com/v1/oauth2/token" \
  -u "${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}" \
  -d "grant_type=client_credentials" | jq -r .access_token)

# 2. Register webhook subscription
curl -X POST "https://api-m.sandbox.paypal.com/v1/notifications/webhooks" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<YOUR_DOMAIN>/api/webhooks/paypal",
    "event_types": [
      { "name": "INVOICING.INVOICE.CREATED" },
      { "name": "INVOICING.INVOICE.SENT" },
      { "name": "INVOICING.INVOICE.UPDATED" },
      { "name": "INVOICING.INVOICE.PAID" },
      { "name": "INVOICING.INVOICE.CANCELLED" },
      { "name": "INVOICING.INVOICE.REFUNDED" }
    ]
  }'
```

---

## 4. Configure Environment Variables

Update `.env.local`:
```ini
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_WEBHOOK_ID=your_registered_webhook_id
PAYPAL_ENABLE_LIVE_MODE=false
```

---

## 5. Security & Verification Architecture

TERMBridge strictly enforces enterprise fintech security on webhooks:
1. **Raw Body Integrity:** Webhook signature verification operates on raw request bytes to prevent whitespace re-serialization tampering.
2. **Authoritative Signature Check:** Every inbound notification is checked against PayPal's `/v1/notifications/verify-webhook-signature` API using the transmission headers.
3. **Idempotency Guarantee:** Event IDs are uniquely indexed in `paypal_webhook_events`. Replayed or duplicated events are rejected before state transitions.
4. **Authoritative State Verification:** A webhook `INVOICE.PAID` notification triggers a server-to-server authoritative `GET /v2/invoicing/invoices/{id}` to ensure the outstanding due balance is exactly `0.00` before marking any transaction `paid`. Partial payments remain `partially_paid`.
