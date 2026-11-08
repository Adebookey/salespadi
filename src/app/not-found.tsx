import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-gray-600">This page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="text-brand-700">Back to dashboard</Link>
    </main>
  );
}
