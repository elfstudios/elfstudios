import Link from "next/link";

export default async function ErrorPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ reason?: string }> }) {
  const searchParams = await searchParamsPromise;
  const pending = searchParams.reason === "payment-pending" || searchParams.reason === "verification-pending";
  const slotConflict = searchParams.reason === "paid-slot-conflict";
  return (
    <main className="min-h-screen p-8 md:p-16 lg:p-24 flex flex-col items-center justify-center font-sans text-center">
      <div className="w-full max-w-2xl border-t-4 border-red-500 bg-elf-gray/50 p-8 space-y-6">
        <h1 className="font-display text-4xl text-red-500 uppercase tracking-widest">
          {pending ? "Payment Verification Pending" : slotConflict ? "Payment Received — Booking Needs Help" : "Payment Failed"}
        </h1>
        <p className="font-sans text-gray-300">
          {pending
            ? "We have not confirmed the payment yet. Do not pay again. Check My Bookings shortly or contact Elf Studios with your transaction reference."
            : slotConflict
              ? "We received your payment after the temporary checkout hold ended, but the selected slot is no longer available. Do not pay again. Please contact Elf Studios with your transaction reference so they can arrange your preferred resolution."
            : "We couldn't confirm your payment. No paid booking has been created. Please try again."}
        </p>

        <div className="pt-8">
          <Link href={pending || slotConflict ? "/my-bookings" : "/book"} className="inline-block bg-elf-orange text-black font-display uppercase tracking-widest px-8 py-4 hover:bg-white transition-colors border-2 border-elf-orange hover:border-white">
            {pending || slotConflict ? "View My Bookings" : "Try Again"}
          </Link>
        </div>
      </div>
    </main>
  );
}
