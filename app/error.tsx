"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

/**
 * Root error boundary — catches any exception the 4 named failure-matrix
 * screens (StatusTracker's ERROR_COPY) don't anticipate: a rendering
 * error, an unexpected null, a library throwing outside a try/catch. Before
 * this, that class of error fell through to Next.js's default unstyled
 * dev/prod overlay — a literal dead end relative to the SOW's own "no dead
 * ends" language, even though every *named* failure mode already had a
 * designed screen. This is a catch-all beneath those, not a replacement
 * for them.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side only, metadata alone — matches lib/logger.ts's own rule
    // of never logging user-entered field values, which don't exist on an
    // Error object anyway, but worth keeping the same discipline explicit.
    logger.error({ route: "client", event: "unhandled_exception", detail: error.digest ?? error.message });
  }, [error]);

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 bg-black px-8 py-16 text-center text-white">
      <span className="text-lg font-semibold tracking-tight">Ferry</span>
      <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
        <p className="text-sm font-semibold text-red-300">Something went wrong</p>
        <p className="mt-2 text-[13px] leading-relaxed text-red-200/80">
          This wasn&apos;t one of the anticipated failure states — it&apos;s an unexpected error in the app itself.
          No funds move without your Freighter signature, so nothing was sent as a result of this.
        </p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-red-300/60">Reference: {error.digest}</p>}
        <button
          onClick={reset}
          className="mt-4 rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-400/20"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
