# Project: Ferry (Stellar Remittance Orchestration)

## Architecture & Tech Stack
- Full-stack Web Application (Next.js App Router, TypeScript, Tailwind CSS).
- Stellar Protocols: SEP-10 (Web Auth), SEP-24 (Hosted Deposit/Withdrawal), SEP-31 (Direct Cross-Border Payments), SEP-38 (Anchor Quotes).
- Security Architecture: Strictly Non-Custodial (Identity documents stay with licensed anchors via hosted handoff).
- Network: Strict Testnet-only execution.

## Key Guidelines for Claude
- Maintain a clean separation between Frontend UI components, API/Orchestrator routes, and Stellar SDK logic.
- Never hardcode private keys or secret seeds. Use `.env.local`.
