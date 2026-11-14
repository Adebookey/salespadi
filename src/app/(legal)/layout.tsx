import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5 sm:h-16">
          <Link href="/login" aria-label="SalesPadi"><Logo /></Link>
          <ThemeToggle initial={theme} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:py-12">
        <article className="space-y-4 text-[15px] leading-7 text-muted [&_a]:font-medium [&_a]:text-accent-text [&_a]:underline-offset-2 hover:[&_a]:underline [&_b]:font-semibold [&_b]:text-fg [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-fg sm:[&_h1]:text-3xl [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </article>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-5 py-6 text-sm text-subtle">
          <span>© {new Date().getFullYear()} SalesPadi</span>
          <Link href="/privacy" className="hover:text-fg">Privacy policy</Link>
          <Link href="/data-deletion" className="hover:text-fg">Delete your data</Link>
        </div>
      </footer>
    </div>
  );
}
