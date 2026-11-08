// Paystack sends the customer here after paying. The webhook is what actually marks the order paid.
export const metadata = { title: "Payment received", robots: { index: false } };

export default function PaidPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6 text-center">
      <div>
        <div className="text-4xl">✅</div>
        <h1 className="mt-3 text-xl font-semibold">Thank you!</h1>
        <p className="mt-1 text-gray-600">We&apos;re confirming your payment. You&apos;ll get your receipt in the chat shortly. You can close this page and go back to WhatsApp or Instagram.</p>
      </div>
    </main>
  );
}
