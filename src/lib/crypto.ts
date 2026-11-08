// AES-256-GCM encryption for access tokens and API keys stored in the database.
// ENCRYPTION_KEY is 32 random bytes, base64 encoded:  openssl rand -base64 32
import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function key(): Buffer {
  const k = Buffer.from(env.encryptionKey, "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return k;
}

export function encrypt(plain: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(token: string, k: Buffer = key()): string {
  const [v, iv, tag, data] = token.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Constant-time HMAC check used by the Meta and Paystack webhooks. */
export function verifyHmac(
  algo: "sha256" | "sha512", secret: string, body: string, signature: string | null, prefix = "",
): boolean {
  if (!signature) return false;
  const expected = prefix + createHmac(algo, secret).update(body, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
