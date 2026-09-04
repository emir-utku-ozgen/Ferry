export default function ClaimLandingPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 text-sm font-bold text-black">
        F
      </span>
      <h1 className="mt-5 max-w-md text-2xl font-semibold text-white">Waiting on a payment link</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
        This page is where you complete a payout someone sent you — but it needs the specific link they shared
        with you, not this address on its own. Ask the sender to resend the link from their Ferry transfer.
      </p>
    </div>
  );
}
