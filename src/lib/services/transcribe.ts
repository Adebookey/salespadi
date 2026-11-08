// Voice-note transcription. Claude reads text and images but not audio, so voice notes go through a
// separate speech-to-text service: any endpoint compatible with the OpenAI /audio/transcriptions API
// (for example a self-hosted Whisper server). Leave TRANSCRIPTION_URL empty to turn this off.
import "server-only";
import { env, transcriptionModel } from "../env";

export async function transcribe(bytes: Buffer, mime: string): Promise<string | null> {
  if (!env.transcriptionUrl) return null;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), `voice.${mime.includes("ogg") ? "ogg" : "m4a"}`);
  form.append("model", transcriptionModel());
  const res = await fetch(env.transcriptionUrl, {
    method: "POST",
    headers: env.transcriptionApiKey ? { Authorization: `Bearer ${env.transcriptionApiKey}` } : {},
    body: form,
  });
  if (!res.ok) {
    console.warn("[transcribe]", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = (await res.json()) as { text?: string };
  return json.text?.trim() || null;
}
