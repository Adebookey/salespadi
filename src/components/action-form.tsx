"use client";
// A <form> wired to a server action with useActionState, showing the result message.
import { useActionState, type ReactNode } from "react";
import { Notice } from "./ui";
import type { ActionState } from "@/app/dashboard/_actions/vendor";

export function ActionForm({
  action, children, className,
}: { action: (state: ActionState, f: FormData) => Promise<ActionState>; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "space-y-4"}>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.message && <Notice tone="success">{state.message}</Notice>}
      {children}
    </form>
  );
}
