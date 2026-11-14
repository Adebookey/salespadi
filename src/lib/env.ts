// Typed, lazy access to environment variables. Throws a clear error when a required one is missing.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}
const optional = (name: string, fallback = "") => process.env[name] || fallback;

export const env = {
  get appUrl() { return optional("APP_URL", "http://localhost:3000").replace(/\/$/, ""); },
  get supabaseUrl() { return required("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabasePublishableKey() { return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"); },
  get supabaseSecretKey() { return required("SUPABASE_SECRET_KEY"); },
  get encryptionKey() { return required("ENCRYPTION_KEY"); },
  get cronSecret() { return required("CRON_SECRET"); },
  get anthropicApiKey() { return optional("ANTHROPIC_API_KEY"); },
  get aiModelRoutine() { return optional("AI_MODEL_ROUTINE", "claude-haiku-5-5"); },
  get aiModelHard() { return optional("AI_MODEL_HARD", "claude-sonnet-5-5"); },
  get metaAppSecret() { return required("META_APP_SECRET"); },
  get metaVerifyToken() { return required("META_VERIFY_TOKEN"); },
  get metaGraphVersion() { return optional("META_GRAPH_VERSION", "v25.0"); },
  get platformWaPhoneNumberId() { return optional("PLATFORM_WA_PHONE_NUMBER_ID"); },
  get platformWaAccessToken() { return optional("PLATFORM_WA_ACCESS_TOKEN"); },
  get platformWaAlertTemplate() { return optional("PLATFORM_WA_ALERT_TEMPLATE", "vendor_alert"); },
  get waFollowupTemplate() { return optional("WA_FOLLOWUP_TEMPLATE", "order_update"); },
  get paystackSecretKey() { return optional("PAYSTACK_SECRET_KEY"); },
  get googleServiceAccountEmail() { return optional("GOOGLE_SERVICE_ACCOUNT_EMAIL"); },
  get googleServiceAccountKey() { return optional("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"); },
  get transcriptionUrl() { return optional("TRANSCRIPTION_URL"); },
  get transcriptionApiKey() { return optional("TRANSCRIPTION_API_KEY"); },
};

export const instagramAppSecret = () => process.env.INSTAGRAM_APP_SECRET || env.metaAppSecret;
export const transcriptionModel = () => process.env.TRANSCRIPTION_MODEL || "whisper-1";
