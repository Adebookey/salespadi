import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">S</div>
          <h1 className="text-2xl font-semibold">SalesPadi</h1>
          <p className="mt-1 text-sm text-gray-600">Your padi for selling on WhatsApp and Instagram.</p>
        </div>
        <LoginForm next={next ?? "/dashboard"} error={error} />
      </div>
    </main>
  );
}
