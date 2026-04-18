"""
PDF report generator using ReportLab.
Clean professional light theme — prints well, looks polished.
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, HRFlowable, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

if TYPE_CHECKING:
    from collect import ReportData

# ── Palette ────────────────────────────────────────────────────────────────────

NAVY    = colors.HexColor("#0f2942")
BLUE    = colors.HexColor("#2563eb")
BLUE_LT = colors.HexColor("#dbeafe")
GREEN   = colors.HexColor("#16a34a")
GREEN_LT= colors.HexColor("#dcfce7")
RED     = colors.HexColor("#dc2626")
RED_LT  = colors.HexColor("#fee2e2")
AMBER   = colors.HexColor("#d97706")
AMBER_LT= colors.HexColor("#fef3c7")
GRAY    = colors.HexColor("#64748b")
GRAY_LT = colors.HexColor("#f8fafc")
GRAY_BD = colors.HexColor("#e2e8f0")
TEXT    = colors.HexColor("#1e293b")
WHITE   = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 1.8 * cm


# ── Styles ─────────────────────────────────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()
    def S(name, **kw):
        return ParagraphStyle(name, **kw)

    return {
        "title":   S("title",   fontName="Helvetica-Bold",   fontSize=26, textColor=WHITE,   leading=32),
        "subtitle":S("subtitle",fontName="Helvetica",         fontSize=12, textColor=colors.HexColor("#93c5fd"), leading=16),
        "h2":      S("h2",      fontName="Helvetica-Bold",   fontSize=14, textColor=NAVY,    spaceBefore=6, spaceAfter=4),
        "h3":      S("h3",      fontName="Helvetica-Bold",   fontSize=10, textColor=NAVY,    spaceBefore=4, spaceAfter=2),
        "body":    S("body",    fontName="Helvetica",         fontSize=9,  textColor=TEXT,    leading=14),
        "small":   S("small",   fontName="Helvetica",         fontSize=8,  textColor=GRAY,    leading=12),
        "mono":    S("mono",    fontName="Courier",           fontSize=8,  textColor=TEXT),
        "err":     S("err",     fontName="Helvetica-Oblique", fontSize=8,  textColor=AMBER,   leading=12),
        "thhd":    S("thhd",    fontName="Helvetica-Bold",   fontSize=8,  textColor=WHITE),
        "td":      S("td",      fontName="Helvetica",         fontSize=8,  textColor=TEXT),
        "td_muted":S("td_muted",fontName="Helvetica",         fontSize=8,  textColor=GRAY),
        "td_green":S("td_green",fontName="Helvetica-Bold",   fontSize=8,  textColor=GREEN),
        "td_red":  S("td_red",  fontName="Helvetica-Bold",   fontSize=8,  textColor=RED),
        "td_amber":S("td_amber",fontName="Helvetica-Bold",   fontSize=8,  textColor=AMBER),
    }


# ── Page templates ─────────────────────────────────────────────────────────────

def _header_footer(canvas, doc, sub_id: str):
    canvas.saveState()
    w, h = A4
    # Top bar
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 0.9 * cm, w, 0.9 * cm, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 7)
    canvas.setFillColor(WHITE)
    canvas.drawString(MARGIN, h - 0.6 * cm, "Azure Cost Optimizer")
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#93c5fd"))
    canvas.drawRightString(w - MARGIN, h - 0.6 * cm, sub_id)
    # Bottom bar
    canvas.setFillColor(GRAY_BD)
    canvas.rect(0, 0, w, 0.7 * cm, fill=1, stroke=0)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GRAY)
    canvas.drawString(MARGIN, 0.22 * cm, "Generated " + datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))
    canvas.drawRightString(w - MARGIN, 0.22 * cm, f"Page {doc.page}")
    canvas.restoreState()


# ── Helpers ────────────────────────────────────────────────────────────────────

def fmt(n: float, digits: int = 0) -> str:
    return f"${n:,.{digits}f}"

def pct(n: float) -> str:
    return f"{n:+.1f}%" if n != 0 else "0.0%"

def impact_color(impact: str):
    return {"High": RED, "Medium": AMBER, "Low": GREEN}.get(impact, GRAY)

def _hr(story):
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1, color=GRAY_BD))
    story.append(Spacer(1, 8))

def _section(story, title: str, st: dict):
    story.append(Spacer(1, 10))
    story.append(Paragraph(title, st["h2"]))
    _hr(story)

def _table_style(has_header=True) -> TableStyle:
    cmds = [
        ("FONTNAME",  (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",  (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), TEXT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, GRAY_LT]),
        ("GRID",      (0, 0), (-1, -1), 0.5, GRAY_BD),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("VALIGN",    (0, 0), (-1, -1), "MIDDLE"),
    ]
    if has_header:
        cmds += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR",  (0, 0), (-1, 0), WHITE),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, 0), 8),
        ]
    return TableStyle(cmds)


# ── Pages ──────────────────────────────────────────────────────────────────────

def _cover_page(story, data: "ReportData", st: dict):
    w = PAGE_W - 2 * MARGIN
    mom_sign = "+" if data.mom_pct >= 0 else ""

    # Big navy banner
    banner = Table(
        [[
            Paragraph("Azure Cost Optimizer", st["title"]),
            Paragraph("Cost Optimization Report", st["subtitle"]),
        ]],
        colWidths=[w * 0.55, w * 0.45],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING",  (0, 0), (-1, -1), 24),
        ("RIGHTPADDING", (0, 0), (-1, -1), 24),
        ("TOPPADDING",   (0, 0), (-1, -1), 40),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 40),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(banner)
    story.append(Spacer(1, 20))

    # Meta row
    meta = Table(
        [
            ["Subscription",    data.sub_name or data.sub_id],
            ["Subscription ID", data.sub_id],
            ["Scanned at",      data.scanned_at.strftime("%B %d, %Y  %H:%M UTC")],
            ["Resources found", str(len(data.resources))],
        ],
        colWidths=[w * 0.28, w * 0.72],
    )
    meta.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",  (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), GRAY),
        ("TEXTCOLOR", (1, 0), (1, -1), TEXT),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("LINEBELOW",     (0, -1), (-1, -1), 1, GRAY_BD),
    ]))
    story.append(meta)
    story.append(Spacer(1, 28))

    # KPI boxes
    kpis = [
        ("Monthly Spend",    fmt(data.total_curr),                 f"{mom_sign}{data.mom_pct:.1f}% vs last month"),
        ("Potential Savings",fmt(data.total_potential_savings),    f"{len(data.orphans)} orphans + {len(data.advisor_recs)} Advisor recs"),
        ("Orphaned Resources",str(len(data.orphans)),              fmt(data.orphan_cost) + " / month wasted"),
        ("Advisor Recs",     str(len(data.advisor_recs)),          fmt(data.advisor_savings) + " savings flagged"),
    ]
    kpi_table = Table(
        [[Paragraph(f"<b>{v}</b><br/><font color='#64748b' size='8'>{label}</font><br/><font color='#94a3b8' size='7'>{sub}</font>", st["body"])
          for label, v, sub in kpis]],
        colWidths=[w / 4] * 4,
    )
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), BLUE_LT),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("TOPPADDING",    (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LINEBEFORE",    (1, 0), (-1, -1), 1, GRAY_BD),
        ("BOX",           (0, 0), (-1, -1), 1, GRAY_BD),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(kpi_table)

    if data.errors:
        story.append(Spacer(1, 16))
        for e in data.errors:
            story.append(Paragraph(f"⚠ {e}", st["err"]))

    story.append(PageBreak())


def _summary_page(story, data: "ReportData", st: dict):
    w = PAGE_W - 2 * MARGIN

    _section(story, "Cost by Resource Type", st)

    top_types = [t for t in data.cost_by_type if t[1]["curr"] > 0][:12]
    if top_types:
        rows = [["Resource Type", "Count", "This Month", "Last Month", "Change"]]
        for type_name, d in top_types:
            display = type_name.split("/")[-1] if "/" in type_name else type_name
            delta   = d["curr"] - d["prev"]
            sign    = "+" if delta >= 0 else ""
            rows.append([
                display,
                str(d["count"]),
                fmt(d["curr"]),
                fmt(d["prev"]),
                f"{sign}{fmt(delta)}",
            ])
        t = Table(rows, colWidths=[w * 0.38, w * 0.1, w * 0.18, w * 0.18, w * 0.16])
        style = _table_style()
        # Colour the Change column
        for i, (_, d) in enumerate(top_types, start=1):
            delta = d["curr"] - d["prev"]
            c = RED if delta > 0 else (GREEN if delta < 0 else GRAY)
            style.add("TEXTCOLOR", (4, i), (4, i), c)
        t.setStyle(style)
        story.append(t)
    else:
        story.append(Paragraph("No cost data available.", st["small"]))

    story.append(PageBreak())


def _savings_page(story, data: "ReportData", st: dict):
    w = PAGE_W - 2 * MARGIN

    # Orphaned resources
    _section(story, f"Orphaned Resources  ({len(data.orphans)} found, {fmt(data.orphan_cost)}/month wasted)", st)

    if data.orphans:
        rows = [["Resource Name", "Type", "Resource Group", "Reason", "Monthly Cost"]]
        for r in sorted(data.orphans, key=lambda x: x.cost_curr, reverse=True):
            rows.append([
                r.name,
                r.type.split("/")[-1] if "/" in r.type else r.type,
                r.rg,
                r.orphan_reason,
                fmt(r.cost_curr),
            ])
        t = Table(rows, colWidths=[w * 0.22, w * 0.14, w * 0.18, w * 0.32, w * 0.14])
        style = _table_style()
        for i in range(1, len(rows)):
            style.add("TEXTCOLOR", (4, i), (4, i), RED)
        t.setStyle(style)
        story.append(t)
    else:
        story.append(Paragraph("No orphaned resources detected.", st["small"]))

    story.append(PageBreak())


def _advisor_page(story, data: "ReportData", st: dict):
    w = PAGE_W - 2 * MARGIN

    _section(story, f"Azure Advisor Recommendations  ({len(data.advisor_recs)} total)", st)

    if data.advisor_recs:
        rows = [["Resource", "Type", "Category", "Impact", "Description", "Est. Savings"]]
        for r in data.advisor_recs[:20]:
            rows.append([
                r.resource_name,
                r.resource_type.split("/")[-1] if "/" in r.resource_type else r.resource_type,
                r.category,
                r.impact,
                r.description[:70] + ("…" if len(r.description) > 70 else ""),
                fmt(r.savings) if r.savings else "—",
            ])
        t = Table(rows, colWidths=[w * 0.16, w * 0.12, w * 0.1, w * 0.08, w * 0.38, w * 0.1])  # noqa: E501 + 0.06 for savings
        style = _table_style()
        for i, rec in enumerate(data.advisor_recs[:20], start=1):
            style.add("TEXTCOLOR", (3, i), (3, i), impact_color(rec.impact))
            style.add("FONTNAME",  (3, i), (3, i), "Helvetica-Bold")
            if rec.savings:
                style.add("TEXTCOLOR", (5, i), (5, i), GREEN)
        t.setStyle(style)
        story.append(t)
    else:
        story.append(Paragraph("No Advisor recommendations found.", st["small"]))


# ── Main entry point ───────────────────────────────────────────────────────────

def generate(data: "ReportData", output_path: str) -> str:
    st = _styles()

    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=1.4 * cm, bottomMargin=1.2 * cm,
        title="Azure Cost Optimization Report",
        author="Azure Cost Optimizer",
    )

    sub_id = data.sub_id
    frame  = Frame(MARGIN, 1.2 * cm, PAGE_W - 2 * MARGIN, PAGE_H - 2.6 * cm, id="main")
    doc.addPageTemplates([
        PageTemplate(id="main", frames=[frame],
                     onPage=lambda c, d: _header_footer(c, d, sub_id))
    ])

    story = []
    _cover_page(story, data, st)
    _summary_page(story, data, st)
    _savings_page(story, data, st)
    _advisor_page(story, data, st)

    doc.build(story)
    return output_path
