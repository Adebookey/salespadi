import { cn } from "./ui";

/** The SalesPadi mark ("Coin P"): a chat bubble whose tail is the stem of a P, with a gold coin in the hole. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] shadow-card", className)}>
      <svg viewBox="0 0 64 64" className="size-full" aria-hidden>
        <defs>
          <linearGradient id="sp-logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#14a05e" /><stop offset="1" stopColor="#0b8a4f" /></linearGradient>
        </defs>
        <rect width="64" height="64" fill="url(#sp-logo)" />
        <path fill="#fff" d="M13.5 24A20 20 0 0 1 53.5 24A20 20 0 0 1 33.5 44H25.5V47.5Q25.5 52 21.6 54.6L13.5 60Z" />
        <circle cx="33.5" cy="24" r="8.2" fill="#0b8a4f" />
        <circle cx="33.5" cy="24" r="5.4" fill="#f5b83d" />
      </svg>
    </span>
  );
}

/** Mark + "salespadi" wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[19px] font-bold tracking-tight">
        <span className="text-fg">sales</span><span className="text-accent-text">padi</span>
      </span>
    </span>
  );
}
