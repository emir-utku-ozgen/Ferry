export default function NonCustodialNotice() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 backdrop-blur-xl">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 text-[11px] text-sky-300" aria-hidden>
        i
      </span>
      <p className="text-xs leading-relaxed text-zinc-400">
        <span className="font-semibold text-zinc-200">Freighter is a Testnet signing tool, not a crypto wallet for
        the sender or recipient.</span> On this corridor, the sender pays in EUR and the recipient is paid out in
        Turkish Lira (TRY) — both fiat, both handled by licensed Anchors. The Freighter connection above exists only
        so this orchestrator can prove control of a Stellar keypair and sign a small number of protocol-level
        messages (SEP-10 authentication, and optionally a trustline setup) on Testnet. Neither the sender nor the
        recipient ever holds, sends, or receives a crypto asset directly.
      </p>
    </div>
  );
}
