"use client";
import { useFormStatus } from "react-dom";
import { Button, cn } from "./ui";
import type { ComponentProps } from "react";

/** Full width on phones (easy to tap), natural width from small tablets up. */
export function SubmitButton({ children, pendingText, className, ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={cn("w-full sm:w-auto", className)} {...props}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}
