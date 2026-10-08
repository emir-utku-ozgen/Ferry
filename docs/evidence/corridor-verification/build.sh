#!/usr/bin/env bash
# Builds corridor-verification-report.pdf from report.md and transfers.yaml.
#
# Requirements: pandoc and WeasyPrint (macOS: brew install pandoc weasyprint), python3.
# PyYAML is installed automatically into a local .venv on first run.
set -euo pipefail
cd "$(dirname "$0")"

for tool in pandoc weasyprint python3; do
  command -v "$tool" >/dev/null || { echo "Missing '$tool'. On macOS: brew install pandoc weasyprint" >&2; exit 1; }
done

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/pip install --quiet pyyaml
fi

# 1. Recalculate the cost table and insert it into report.md (Section 5).
.venv/bin/python build_cost_table.py

# 2. Warn about screenshots referenced by the report that are not in images/ yet.
grep -oE 'images/[A-Za-z0-9_-][A-Za-z0-9._-]*\.[A-Za-z]+' report.md | sort -u | while read -r img; do
  [ -f "$img" ] || echo "Note: $img not found yet — it will appear as [TODO] text in the PDF."
done

# 3. Markdown -> HTML -> PDF.
pandoc report.md \
  --from markdown \
  --to html5 \
  --standalone \
  --metadata pagetitle="Corridor Verification, Pilot Terms and Cost Baseline" \
  --metadata lang=en \
  --css style.css \
  --pdf-engine weasyprint \
  --resource-path . \
  --output corridor-verification-report.pdf

echo "Wrote $(pwd)/corridor-verification-report.pdf"
