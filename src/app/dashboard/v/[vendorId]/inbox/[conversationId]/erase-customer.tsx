"use client";
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/sheet";

/** Asks for confirmation before erasing a customer's data for good. */
export function EraseCustomer({ name, onConfirm }: { name: string; onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="danger-ghost" size="sm" className="mt-2 w-full" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete customer data
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Delete customer data?">
        <div className="space-y-4 px-2 text-sm leading-relaxed text-muted">
          <p>This permanently deletes <b className="text-fg">{name}</b>&apos;s chats, photos, voice notes and receipts, and removes their name, phone and address from their orders. Order amounts stay for your records.</p>
          <p>Use this when a customer asks you to delete their data. It can&apos;t be undone.</p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="danger" disabled={pending} onClick={() => start(() => onConfirm())}>
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
