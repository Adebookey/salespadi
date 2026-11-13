import { cn } from "./ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-8 items-center justify-center rounded-[10px] bg-accent text-accent-fg shadow-card", className)}>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12.5c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5S15.9 19 12 19c-1.1 0-2.2-.2-3.1-.7L5 19.5l1.2-3.3A6.2 6.2 0 0 1 5 12.5Z" />
        <path d="m9.2 12.6 1.9 1.9 3.8-3.9" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight text-fg">SalesPadi</span>
    </span>
  );
}
