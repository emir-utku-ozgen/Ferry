export default function NonCustodialNotice() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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
