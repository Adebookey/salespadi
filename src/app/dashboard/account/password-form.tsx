"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Notice } from "@/components/ui";

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setMessage({ tone: "error", text: "Use at least 8 characters." });
    if (password !== confirm) return setMessage({ tone: "error", text: "The two passwords don't match." });
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setMessage({ tone: "error", text: error.message });
    setPassword("");
    setConfirm("");
    setMessage({ tone: "success", text: "Password changed." });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Field label="New password"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Change password"}</Button>
    </form>
  );
}
