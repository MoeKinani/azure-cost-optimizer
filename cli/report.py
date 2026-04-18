#!/usr/bin/env python3
"""
Azure Cost Optimizer — Lightweight CLI
Generates a PDF cost report straight from `az login`. No web server, no Docker.

Usage:
  python report.py                                  # auto-discover subscription
  python report.py --subscription <id>              # specific subscription
  python report.py --output my-report.pdf           # custom output path
  python report.py --tenant <id> --client-id <id> --client-secret <secret>

Requirements:
  pip install -r requirements.txt
  az login   (or set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date


# ── Terminal helpers ───────────────────────────────────────────────────────────

def _ok(msg):  print(f"  \u2713 {msg}")
def _info(msg):print(f"  \u2192 {msg}")
def _warn(msg):print(f"  \u26a0  {msg}", file=sys.stderr)
def _err(msg): print(f"  \u2717 {msg}", file=sys.stderr)

def _banner():
    print()
    print("  \u2601  Azure Cost Optimizer — CLI Report Generator")
    print("  " + "─" * 46)
    print()


def _pick_subscription(subs: list) -> dict:
    if len(subs) == 1:
        _ok(f"Using subscription: {subs[0]['name']} ({subs[0]['id']})")
        return subs[0]
    print(f"\n  Found {len(subs)} subscriptions:\n")
    for i, s in enumerate(subs, 1):
        print(f"    {i:>2}.  {s['name']}")
        print(f"         {s['id']}")
    print()
    while True:
        try:
            choice = input(f"  Select [1–{len(subs)}]: ").strip()
            idx = int(choice) - 1
            if 0 <= idx < len(subs):
                return subs[idx]
        except (ValueError, KeyboardInterrupt):
            pass
        print("  Invalid choice, try again.")


def _default_output(sub_id: str) -> str:
    today  = date.today().strftime("%Y-%m-%d")
    prefix = sub_id[:8] if sub_id else "report"
    return f"azure-cost-report-{prefix}-{today}.pdf"


def _print_summary(data) -> None:
    mom = data.mom_pct
    sign = "+" if mom >= 0 else ""
    print()
    print("  ┌─────────────────────────────────────────────┐")
    print(f"  │  Monthly spend     ${data.total_curr:>10,.2f}              │")
    print(f"  │  vs last month     {sign}{mom:.1f}%                      │")
    print(f"  │  Potential savings ${data.total_potential_savings:>10,.2f} / month      │")
    print(f"  │  Orphaned resources  {len(data.orphans):>4}  (${data.orphan_cost:,.2f}/mo)   │")
    print(f"  │  Advisor recs        {len(data.advisor_recs):>4}  (${data.advisor_savings:,.2f} flagged) │")
    print(f"  │  Total resources     {len(data.resources):>4}                        │")
    print("  └─────────────────────────────────────────────┘")
    print()
    if data.errors:
        for e in data.errors:
            _warn(e)
        print()


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate an Azure cost optimization PDF report.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--subscription",  "-s", metavar="ID",   help="Azure subscription ID to scan")
    parser.add_argument("--output",        "-o", metavar="FILE", help="Output PDF path (default: auto-named)")
    parser.add_argument("--tenant",        metavar="ID",         help="Tenant ID (service principal auth)")
    parser.add_argument("--client-id",     metavar="ID",         help="Client ID (service principal auth)")
    parser.add_argument("--client-secret", metavar="SECRET",     help="Client secret (service principal auth)")
    parser.add_argument("--no-pdf",        action="store_true",  help="Print summary to terminal only, skip PDF")
    args = parser.parse_args()

    _banner()

    # ── Authenticate ──────────────────────────────────────────────────────────
    print("  Authenticating…")
    try:
        from collect import get_credential, list_subscriptions
        credential = get_credential(
            tenant_id     = args.tenant or "",
            client_id     = getattr(args, "client_id", "") or "",
            client_secret = getattr(args, "client_secret", "") or "",
        )
        # Probe the credential
        credential.get_token("https://management.azure.com/.default")
        _ok("Authenticated successfully")
    except Exception as exc:
        _err(f"Authentication failed: {exc}")
        print()
        print("  Try running:  az login")
        print("  Or set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET")
        print()
        sys.exit(1)

    # ── Select subscription ───────────────────────────────────────────────────
    if args.subscription:
        sub = {"id": args.subscription, "name": args.subscription}
    else:
        print("  Discovering subscriptions…")
        try:
            subs = list_subscriptions(credential)
        except Exception as exc:
            _err(f"Could not list subscriptions: {exc}")
            sys.exit(1)
        if not subs:
            _err("No enabled subscriptions found.")
            sys.exit(1)
        sub = _pick_subscription(subs)

    sub_id   = sub["id"]
    sub_name = sub["name"]
    output   = args.output or _default_output(sub_id)

    # ── Collect data ──────────────────────────────────────────────────────────
    print(f"\n  Scanning: {sub_name} ({sub_id})\n")
    from collect import collect

    def progress(msg: str):
        _info(msg)

    try:
        data = collect(credential, sub_id, sub_name, progress=progress)
    except Exception as exc:
        _err(f"Scan failed: {exc}")
        sys.exit(1)

    _print_summary(data)

    if args.no_pdf:
        return

    # ── Generate PDF ──────────────────────────────────────────────────────────
    print("  Generating PDF report…")
    try:
        from pdf_gen import generate
        generate(data, output)
        _ok(f"Report saved: {os.path.abspath(output)}")
        print()
    except ImportError:
        _err("reportlab not installed. Run:  pip install reportlab")
        sys.exit(1)
    except Exception as exc:
        _err(f"PDF generation failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
