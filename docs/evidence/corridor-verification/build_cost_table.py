"""Builds the Section 5 cost table (and related parts) of report.md from transfers.yaml.

Formula (also stated in report.md §5.2):
    total_paid     = eur_sent + send_fee_eur
    value_received = try_received / mid_market_rate
    fx_cost        = eur_sent - value_received
    total_cost     = send_fee_eur + fx_cost
    total_cost_pct = total_cost / total_paid * 100

Updates report.md in place between the COST_TABLE / RECEIPTS markers and the
"Baseline table shows measured total cost..." row of §6. Missing values are
shown as [TODO] and never estimated.
"""

import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPORT = HERE / "report.md"
DATA = HERE / "transfers.yaml"
IMAGES = HERE / "images"

NUMERIC = ("eur_sent", "send_fee_eur", "try_received", "mid_market_rate")
TODO = "[TODO]"


def is_blank(value):
    return value is None or (isinstance(value, str) and not value.strip())


def to_decimal(value, field, channel):
    if is_blank(value):
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        sys.exit(f"transfers.yaml: '{field}' for channel '{channel}' is not a number: {value!r}")


def fmt(value, places=2):
    if value is None:
        return TODO
    rounded = round(value, places)
    return f"{rounded + 0:,.{places}f}" if rounded else f"{0:.{places}f}"


def text(value):
    return TODO if is_blank(value) else str(value).strip()


def label(row, index):
    return text(row.get("channel")) if not is_blank(row.get("channel")) else f"[TODO: channel {index} name]"


def compute(row):
    name = text(row.get("channel"))
    nums = {f: to_decimal(row.get(f), f, name) for f in NUMERIC}
    result = dict(nums, fx_cost=None, total_cost=None, total_cost_pct=None)
    if all(v is not None for v in nums.values()):
        if nums["mid_market_rate"] <= 0:
            sys.exit(f"transfers.yaml: mid_market_rate for channel '{name}' must be greater than 0")
        total_paid = nums["eur_sent"] + nums["send_fee_eur"]
        value_received = nums["try_received"] / nums["mid_market_rate"]
        result["fx_cost"] = nums["eur_sent"] - value_received
        result["total_cost"] = nums["send_fee_eur"] + result["fx_cost"]
        result["total_cost_pct"] = result["total_cost"] / total_paid * 100 if total_paid else None
    return result


def receipt_ok(row):
    name = row.get("receipt_image")
    return not is_blank(name) and (IMAGES / str(name).strip()).is_file()


def build_table(rows):
    lines = [
        "| Channel | Date | EUR sent | Fee (EUR) | TRY received | Mid-market rate (TRY/EUR) "
        "| Exchange-rate cost (EUR) | Total cost (EUR) | Total cost (%) | Receipt |",
        "|---|---|--:|--:|--:|--:|--:|--:|--:|---|",
    ]
    for i, row in enumerate(rows, 1):
        c = compute(row)
        lines.append(
            f"| {label(row, i)} | {text(row.get('date'))} "
            f"| {fmt(c['eur_sent'])} | {fmt(c['send_fee_eur'])} | {fmt(c['try_received'])} "
            f"| {fmt(c['mid_market_rate'], 4)} | {fmt(c['fx_cost'])} | {fmt(c['total_cost'])} "
            f"| {fmt(c['total_cost_pct'])} | {text(row.get('receipt_image'))} |"
        )
    return "\n".join(lines)


def build_notes(rows, source):
    source = "[TODO: fill in mid_market_source in transfers.yaml]" if is_blank(source) else str(source).strip()
    notes = [f"**Mid-market rate source:** {source}"]
    for i, row in enumerate(rows, 1):
        if not is_blank(row.get("notes")):
            notes.append(f"**{label(row, i)}:** {str(row['notes']).strip()}")
    return "\n\n".join(notes)


def baseline_check(rows):
    if not rows:
        return "✗ — no channels in transfers.yaml"
    incomplete, no_receipt, problems = [], [], []
    for i, row in enumerate(rows, 1):
        name = text(row.get("channel")) if not is_blank(row.get("channel")) else f"channel {i}"
        if is_blank(row.get("channel")) or is_blank(row.get("date")) or compute(row)["total_cost"] is None:
            incomplete.append(name)
        if not receipt_ok(row):
            no_receipt.append(name)
    if incomplete:
        problems.append("data incomplete for " + ", ".join(incomplete))
    if no_receipt:
        problems.append("receipt missing for " + ", ".join(no_receipt))
    dates = {str(r.get("date")).strip() for r in rows if not is_blank(r.get("date"))}
    if len(dates) > 1:
        problems.append("transfers were not all made on the same day")
    if problems:
        return "✗ — " + "; ".join(problems)
    return "✓"


def build_receipts(rows):
    parts = ["## Appendix A. Transfer Receipts"]
    for i, row in enumerate(rows, 1):
        name = label(row, i)
        parts.append(f"### {name}")
        image = row.get("receipt_image")
        if receipt_ok(row):
            parts.append(f"![Receipt — {name}](images/{str(image).strip()})")
        else:
            parts.append("[TODO: add the receipt screenshot to images/ and set receipt_image in transfers.yaml]")
    return "\n\n".join(parts)


def replace_block(doc, tag, body):
    pattern = re.compile(rf"(<!-- {tag}_START -->\n).*?(<!-- {tag}_END -->)", re.S)
    if not pattern.search(doc):
        sys.exit(f"report.md: markers for {tag} not found")
    return pattern.sub(lambda m: f"{m.group(1)}\n{body}\n\n{m.group(2)}", doc)


def main():
    data = yaml.safe_load(DATA.read_text(encoding="utf-8")) or {}
    rows = data.get("transfers") or []

    doc = REPORT.read_text(encoding="utf-8")
    doc = replace_block(doc, "COST_TABLE", build_table(rows) + "\n\n" + build_notes(rows, data.get("mid_market_source")))
    doc = replace_block(doc, "RECEIPTS", build_receipts(rows))

    check_row = re.compile(r"^\| Baseline table shows measured total cost of each channel \|.*\|$", re.M)
    if not check_row.search(doc):
        sys.exit("report.md: success-criteria row for the baseline table not found")
    doc = check_row.sub(
        lambda _: f"| Baseline table shows measured total cost of each channel | {baseline_check(rows)} |", doc
    )

    REPORT.write_text(doc, encoding="utf-8")
    print(f"Updated {REPORT.name} from {DATA.name} ({len(rows)} channels)")


if __name__ == "__main__":
    main()
