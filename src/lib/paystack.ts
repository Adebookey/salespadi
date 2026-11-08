// Paystack: payment links (transaction/initialize), verification and webhook signatures.
import { verifyHmac } from "./crypto";

const API = "https://api.paystack.co";

export interface InitializeInput {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export async function initializeTransaction(secretKey: string, input: InitializeInput) {
  const res = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  });
  const json = (await res.json()) as { status: boolean; message: string; data?: { authorization_url: string; reference: string } };
  if (!res.ok || !json.status || !json.data) throw new Error(`Paystack initialize failed: ${json.message}`);
  return json.data;
}

export async function verifyTransaction(secretKey: string, reference: string) {
  const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const json = (await res.json()) as {
    status: boolean;
    data?: { status: string; amount: number; currency: string; reference: string };
  };
  return json.status && json.data ? json.data : null;
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the account's secret key. */
export function verifyPaystackSignature(secretKey: string, rawBody: string, signature: string | null) {
  return verifyHmac("sha512", secretKey, rawBody, signature);
}

/** Customers on WhatsApp rarely give an email; Paystack requires one, so we use a stable placeholder. */
export function placeholderEmail(customerPhoneOrId: string, domain = process.env.CUSTOMER_EMAIL_DOMAIN || "customers.salespadi.ng") {
  return `${customerPhoneOrId.replace(/[^a-zA-Z0-9]/g, "")}@${domain}`;
}
