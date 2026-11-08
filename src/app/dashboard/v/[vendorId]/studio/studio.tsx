"use client";
import { useRef, useState, useTransition } from "react";
import { Button, Card, Notice, Textarea, cn } from "@/components/ui";
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

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card className="flex min-h-[60vh] flex-col p-0">
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[#efeae2] p-3">
          {items.length === 0 && <p className="m-auto text-sm text-gray-500">Send a message, or pick a sample on the right.</p>}
          {items.map((m, i) => (
            <div key={i} className={cn("max-w-[85%]", m.role === "user" ? "self-end" : "self-start")}>
              <div className={cn("rounded-lg px-3 py-2 text-sm shadow-sm", m.role === "user" ? "bg-[#d9fdd3]" : "bg-white")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.image && <img src={m.image} alt="" className="mb-1 max-h-48 rounded" />}
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
              {m.meta?.photos?.map((p, j) => (
                <div key={j} className="mt-1 w-48 rounded-lg bg-white p-1 text-xs shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="rounded" /><div className="p-1">{p.caption}</div>
                </div>
              ))}
              {m.meta && (
                <details className="mt-1 text-xs text-gray-600">
                  <summary className="cursor-pointer">
                    {m.meta.model} · ${m.meta.costUsd?.toFixed(4)} · {m.meta.toolCalls?.length ?? 0} tool call(s){m.meta.handedOff ? " · HANDED OFF" : ""}
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {m.meta.toolCalls?.map((t, j) => (
                      <li key={j} className="rounded bg-white/70 p-1.5 font-mono text-[11px]">
                        <b>{t.name}</b>({JSON.stringify(t.input)})<br />→ {JSON.stringify(t.result).slice(0, 400)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
          {pending && <div className="self-start rounded-lg bg-white px-3 py-2 text-sm text-gray-400 shadow-sm">typing…</div>}
        </div>
        <div className="space-y-2 border-t border-gray-100 p-3">
          {error && <Notice tone="error">{error}</Notice>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image && <div className="flex items-center gap-2 text-xs"><img src={image} alt="" className="h-12 rounded" /><button onClick={() => setImage(undefined)} className="text-red-600">Remove</button></div>}
          <div className="flex gap-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="min-h-0 flex-1" placeholder="Write as a customer…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <div className="flex flex-col gap-1">
              <Button onClick={() => send()} disabled={pending}>Send</Button>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
              <Button variant="secondary" onClick={() => file.current?.click()} type="button">Photo</Button>
            </div>
          </div>
        </div>
      </Card>
      <div className="space-y-3">
        <Card>
          <h2 className="text-sm font-medium">Try these</h2>
          <ul className="mt-2 space-y-1.5">
            {SAMPLES.map((s) => <li key={s}><button disabled={pending} onClick={() => send(s)} className="text-left text-sm text-brand-700 hover:underline">{s}</button></li>)}
          </ul>
        </Card>
        {state && (state.orders.length > 0 || state.handoffs.length > 0) && (
          <Card className="text-sm">
            <h2 className="font-medium">Simulated</h2>
            {state.orders.map((o) => <p key={o.id}>Order #{o.number}: {o.status}{o.payment_method ? `, ${o.payment_method}` : ""}</p>)}
            {state.handoffs.map((h, i) => <p key={i} className="text-amber-700">Handoff: {h}</p>)}
          </Card>
        )}
        <Button variant="ghost" onClick={() => { setItems([]); setState(undefined); }}>Start over</Button>
      </div>
    </div>
  );
}
