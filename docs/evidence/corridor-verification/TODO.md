# Corridor Verification Report — TODO

Everything below must come from real sources (anchor e-mails, real transfers, receipts). Run `./build.sh` after each update to regenerate the PDF.

## Cover (`report.md`)
- [x] Report date
- [x] Prepared by (name and role)

## 1. Summary (`report.md`)
- [x] 3–4 sentence summary (current-status version written 2026-10-08 — rewrite once anchors confirm and transfers are measured)

## 2. Anchor Confirmations (`report.md`)
### EUR side
- [ ] Anchor legal name
- [ ] Contact person (name and role)
- [ ] Date of written confirmation
- [ ] Screenshot of the confirmation e-mail → `images/eur-anchor-confirmation.png`

### TRY side
- [ ] Anchor legal name
- [ ] Contact person (name and role)
- [ ] Date of written confirmation
- [ ] Screenshot of the confirmation e-mail → `images/try-anchor-confirmation.png`

## 3. Agreed Pilot Terms (`report.md`, both anchors)
- [ ] Minimum amount per transfer
- [ ] Maximum amount per transfer
- [ ] Fees
- [ ] Quote validity period
- [ ] Refund triggers
- [ ] Refund time
- [ ] Refund method

## 4. Production Parameters (`report.md`)
- [ ] EUR anchor name and domain
- [ ] TRY anchor name and domain
- [ ] Circle's mainnet EURC issuer address (verified)
- [ ] Minimum amount per transfer
- [ ] Maximum amount per transfer (and daily/monthly limits, if any)
- [ ] Anchor fees
- [ ] Quote validity period
- [ ] Refund triggers, time and method
- [ ] End-to-end settlement time

## 5. Cost Comparison (`transfers.yaml`)
- [ ] `mid_market_source` (rate source and how it was captured)
- [ ] Ferry (Stellar): date, eur_sent, send_fee_eur, try_received, mid_market_rate, receipt_image
- [ ] Channel 2: name, date, eur_sent, send_fee_eur, try_received, mid_market_rate, receipt_image
- [ ] Channel 3: name, date, eur_sent, send_fee_eur, try_received, mid_market_rate, receipt_image
- [ ] Channel 4: name, date, eur_sent, send_fee_eur, try_received, mid_market_rate, receipt_image
- [ ] All receipt screenshots added to `images/`

## 7. Success Criteria (`report.md`)
- [ ] "Both anchors confirmed in writing" → ✓ or ✗ (manual)
- [ ] "Baseline table…" row shows ✓ after `./build.sh` (automatic)

## Follow-up
- [ ] Update `CORRIDOR_VERIFICATION.md` (repo root) to match once anchor confirmations arrive
