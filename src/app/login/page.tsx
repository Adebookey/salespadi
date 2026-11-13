import { LoginForm } from "./login-form";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const theme = await getTheme();
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-5 py-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,var(--accent-soft),transparent)]" aria-hidden />
      <ThemeToggle initial={theme} className="absolute right-3 top-3" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <LogoMark className="mx-auto mb-4 size-12 rounded-2xl [&>svg]:size-7" />
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted">Sign in to SalesPadi</p>
        </div>
        <LoginForm next={next ?? "/dashboard"} error={error} />
        <p className="mt-6 text-center text-xs text-subtle">Your padi for selling on WhatsApp and Instagram.</p>
      </div>
    </main>
  );
}
