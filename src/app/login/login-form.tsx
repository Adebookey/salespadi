"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

export function LoginForm({ next, error }: { next: string; error?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(
    error ? { tone: "error", text: error } : null,
  );
  const supabase = createClient();

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMessage({ tone: "error", text: error.message });
    router.replace(next);
    router.refresh();
  }

  async function magicLink() {
    if (!email) return setMessage({ tone: "error", text: "Enter your email first." });
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false },
    });
    setBusy(false);
    setMessage(error ? { tone: "error", text: error.message } : { tone: "success", text: "Check your email for a sign-in link." });
  }

  return (
    <Card>
      <form onSubmit={signIn} className="space-y-4">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy || !password}>Sign in</Button>
        <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={magicLink}>
          Email me a sign-in link
        </Button>
      </form>
    </Card>
  );
}
