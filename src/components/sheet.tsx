"use client";
// Bottom sheet on phones, centred panel on larger screens. Closes on backdrop tap, Escape and navigation.
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const path = usePathname();
  const first = useRef(path);
  useEffect(() => {
    if (path !== first.current) onClose();
    first.current = path;
  }, [path, onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open, onClose]);
  if (!open) return null;
  // Rendered into <body>: a blurred sticky header would otherwise trap a fixed-position panel inside it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-overlay backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className="pb-safe relative max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-2xl sm:max-w-sm sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between bg-surface px-4 pb-2 pt-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          <button onClick={onClose} className="-mr-2 inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-3 pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
