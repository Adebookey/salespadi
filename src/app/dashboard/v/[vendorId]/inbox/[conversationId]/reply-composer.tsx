"use client";
import { SendHorizontal } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Checkbox, Notice } from "@/components/ui";
import type { ActionState } from "@/app/dashboard/_actions/vendor";

function Send() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-label="Send"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-card transition hover:bg-accent-hover disabled:opacity-50">
      <SendHorizontal className="size-5" />
    </button>
  );
}

export function ReplyComposer({ action, placeholder, windowClosed, whatsapp }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>; placeholder: string; windowClosed: boolean; whatsapp: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={formAction} className="space-y-2">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {windowClosed && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          Their last message was over 24 hours ago. {whatsapp ? "WhatsApp only allows an approved template now." : "Instagram won't deliver until they write again."}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea name="text" rows={1} placeholder={placeholder}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl border-0 bg-surface-2 px-4 py-2.5 text-base text-fg ring-1 ring-inset ring-line placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-focus sm:text-sm"
          onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 160)}px`; }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        <Send />
      </div>
      {windowClosed && whatsapp && <Checkbox name="use_template" label="Send as approved template" defaultChecked />}
    </form>
  );
}
