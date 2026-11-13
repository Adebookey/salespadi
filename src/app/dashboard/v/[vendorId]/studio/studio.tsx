"use client";
import { useRef, useState, useTransition } from "react";
import { ChevronDown, ImagePlus, RotateCcw, SendHorizontal, Sparkles } from "lucide-react";
import { Badge, Button, Card, Notice, cn } from "@/components/ui";
import { runStudio, type StudioResult, type StudioState, type StudioTurn } from "../../../_actions/studio";

const SAMPLES = [
  "Hi, do you have white sneakers in size 42?",
  "Abeg how much be the chelsea boot? You get size 44?",
  "How much is delivery to Lekki?",
  "I want to order the red heels size 39, deliver to 12 Adeola Odeku VI. I'm Amaka, 08031234567",
  "My order never arrived and nobody is answering me. I want my money back!",
  "Can you do ₦15,000 for the loafers?",
];

type Item = { role: "user" | "assistant"; text: string; meta?: StudioResult; image?: string };

export function Studio({ vendorId }: { vendorId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [state, setState] = useState<StudioState | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  function send(message = text) {
    if (!message.trim() && !image) return;
    const history: StudioTurn[] = items.map((i) => ({ role: i.role, text: i.text }));
    const sentImage = image;
    setItems((x) => [...x, { role: "user", text: message, image: sentImage }]);
    setText("");
    setImage(undefined);
    setError(null);
    start(async () => {
      const r = await runStudio(vendorId, history, message, sentImage, state);
      if (r.error) { setError(r.error); return; }
      setState(r.state);
      setItems((x) => [...x, { role: "assistant", text: r.reply || "(no text reply)", meta: r }]);
    });
  }

  function pick(f: File | undefined) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(f);
  }

  const samples = (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
      {SAMPLES.map((s) => (
        <button key={s} disabled={pending} onClick={() => send(s)}
          className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm text-fg transition hover:border-accent/50 hover:bg-surface-2 disabled:opacity-50 max-lg:max-w-[16rem] max-lg:truncate">
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px] [&>*]:min-w-0">
      <div className="space-y-2 lg:hidden">
        <p className="text-xs font-medium text-subtle">Try a sample message</p>
        {samples}
      </div>

      <div className="-mx-4 flex min-h-[60dvh] flex-col overflow-hidden border-y border-line sm:mx-0 sm:rounded-xl sm:border sm:shadow-card">
        <div className="flex flex-1 flex-col gap-3 bg-chat px-3 py-4 sm:px-5">
          {items.length === 0 && (
            <div className="m-auto max-w-xs text-center">
              <Sparkles className="mx-auto mb-3 size-7 text-subtle" />
              <p className="text-sm text-muted">Write as a customer would, or tap a sample. Nothing here reaches real customers.</p>
            </div>
          )}
          {items.map((m, i) => (
            <div key={i} className={cn("max-w-[88%] sm:max-w-[75%]", m.role === "user" ? "self-end" : "self-start")}>
              <div className={cn("rounded-2xl px-3 py-2 text-[15px] leading-snug text-fg shadow-card sm:text-sm",
                m.role === "user" ? "rounded-br-md bg-bubble-out" : "rounded-bl-md bg-bubble-in")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.image && <img src={m.image} alt="" className="mb-1.5 max-h-48 rounded-xl" />}
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
              {m.meta?.photos?.map((p, j) => (
                <div key={j} className="mt-1.5 w-52 overflow-hidden rounded-2xl bg-bubble-in text-xs text-fg shadow-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="aspect-square w-full object-cover" /><div className="px-3 py-2">{p.caption}</div>
                </div>
              ))}
              {m.meta && (
                <details className="group mt-1 text-xs text-subtle">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span>{m.meta.model}</span><span>·</span><span className="tabular">${m.meta.costUsd?.toFixed(4)}</span><span>·</span>
                    <span>{m.meta.toolCalls?.length ?? 0} tool call(s)</span>
                    {m.meta.handedOff && <Badge colour="amber">Handed off</Badge>}
                    <ChevronDown className="size-3.5 transition group-open:rotate-180" />
                  </summary>
                  <ul className="mt-1.5 space-y-1.5">
                    {m.meta.toolCalls?.map((t, j) => (
                      <li key={j} className="overflow-x-auto rounded-lg border border-line bg-surface p-2 font-mono text-[11px] leading-relaxed text-muted">
                        <span className="font-semibold text-fg">{t.name}</span>({JSON.stringify(t.input)})<br />→ {JSON.stringify(t.result).slice(0, 400)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
          {pending && (
            <div className="flex gap-1 self-start rounded-2xl rounded-bl-md bg-bubble-in px-4 py-3 shadow-card" aria-label="Assistant is typing">
              {[0, 150, 300].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-subtle" style={{ animationDelay: `${d}ms` }} />)}
            </div>
          )}
        </div>

        <div className="sticky bottom-16 z-10 space-y-2 border-t border-line bg-surface/95 px-3 py-2.5 backdrop-blur-xl sm:px-4 md:bottom-0">
          {error && <Notice tone="error">{error}</Notice>}
          {image && (
            <div className="flex items-center gap-2 text-xs text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="h-12 rounded-lg" />
              <button onClick={() => setImage(undefined)} className="text-red-600 dark:text-red-400">Remove</button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <button type="button" onClick={() => file.current?.click()} aria-label="Attach a photo"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg">
              <ImagePlus className="size-5" />
            </button>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Write as a customer…"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl border-0 bg-surface-2 px-4 py-2.5 text-base text-fg ring-1 ring-inset ring-line placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-focus sm:text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button onClick={() => send()} disabled={pending || (!text.trim() && !image)} aria-label="Send"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-card transition hover:bg-accent-hover disabled:opacity-40">
              <SendHorizontal className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="hidden lg:block">
          <h2 className="mb-2 text-sm font-semibold text-fg">Try a sample</h2>
          {samples}
        </div>
        {state && (state.orders.length > 0 || state.handoffs.length > 0) && (
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-fg">Simulated so far</h2>
            <ul className="space-y-1.5 text-sm">
              {state.orders.map((o) => <li key={o.id} className="text-fg">Order #{o.number}: <span className="text-muted">{o.status.replace(/_/g, " ")}{o.payment_method ? `, ${o.payment_method}` : ""}</span></li>)}
              {state.handoffs.map((h, i) => <li key={i} className="text-amber-700 dark:text-amber-300">Handoff: {h}</li>)}
            </ul>
          </Card>
        )}
        {items.length > 0 && (
          <Button variant="secondary" className="w-full" onClick={() => { setItems([]); setState(undefined); }}>
            <RotateCcw className="size-4" /> Start over
          </Button>
        )}
      </div>
    </div>
  );
}
