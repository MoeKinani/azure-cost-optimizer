import React, { useState } from 'react'
import { pdf, Document, Page, Text, View, StyleSheet, Font, Svg, Path, Rect, Circle, Polyline } from '@react-pdf/renderer'
import { FileDown, Loader } from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt  = (n, digits = 0) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
const pct  = (n) => `${Number(n ?? 0).toFixed(1)}%`
const date = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

// ── Styles ─────────────────────────────────────────────────────────────────────

const C = {
  bg:        '#0f172a',
  bgCard:    '#1e293b',
  bgLight:   '#334155',
  accent:    '#3b82f6',
  accentDim: '#1d4ed8',
  success:   '#22c55e',
  warn:      '#f59e0b',
  danger:    '#ef4444',
  text:      '#f1f5f9',
  textMuted: '#94a3b8',
  textDim:   '#64748b',
  border:    '#334155',
  white:     '#ffffff',
  green:     '#86efac',
}

const s = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    padding: 0,
    fontFamily: 'Helvetica',
    color: C.text,
  },

  // Cover
  cover: { flex: 1, padding: 48, justifyContent: 'space-between' },
  coverLogo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  coverLogoWordmark: { flexDirection: 'column', gap: 2 },
  coverLogoEyebrow: { fontSize: 8, color: C.textDim, letterSpacing: 2, fontFamily: 'Helvetica-Bold' },
  coverLogoTitle: { fontSize: 16, color: C.white, fontFamily: 'Helvetica-Bold' },
  coverLogoTagline: { fontSize: 7.5, color: C.textDim },
  coverCenter: { flex: 1, justifyContent: 'center', paddingVertical: 40 },
  coverTitle: { fontSize: 32, fontFamily: 'Helvetica-Bold', color: C.white, marginBottom: 10 },
  coverSubtitle: { fontSize: 14, color: C.textMuted, marginBottom: 28 },
  coverMeta: { backgroundColor: C.bgCard, borderRadius: 10, padding: 20, gap: 8, borderLeft: `3px solid ${C.accent}` },
  coverMetaRow: { flexDirection: 'row', gap: 6 },
  coverMetaLabel: { fontSize: 9, color: C.textDim, width: 90 },
  coverMetaValue: { fontSize: 9, color: C.text, flex: 1 },
  coverFooter: { fontSize: 8, color: C.textDim },

  // Section page
  inner: { padding: 40 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingBottom: 10, borderBottom: `1px solid ${C.border}` },
  sectionTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.white },
  sectionBadge: { marginLeft: 10, backgroundColor: C.accentDim, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  sectionBadgeText: { fontSize: 8, color: C.white, fontFamily: 'Helvetica-Bold' },

  // KPI grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  kpiCard: { width: '30%', backgroundColor: C.bgCard, borderRadius: 8, padding: 14, borderTop: `2px solid ${C.accent}` },
  kpiLabel: { fontSize: 8, color: C.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.white },
  kpiSub: { fontSize: 8, color: C.textMuted, marginTop: 3 },

  // Table
  table: { marginBottom: 20 },
  tableHead: { flexDirection: 'row', backgroundColor: C.bgLight, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 2 },
  tableHeadCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 7, borderBottom: `1px solid ${C.border}` },
  tableRowAlt: { backgroundColor: '#ffffff08' },
  tableCell: { fontSize: 8.5, color: C.text },
  tableCellMuted: { fontSize: 8.5, color: C.textMuted },

  // Pill
  pillGreen:  { backgroundColor: '#14532d', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.5 },
  pillRed:    { backgroundColor: '#450a0a', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.5 },
  pillYellow: { backgroundColor: '#451a03', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.5 },
  pillBlue:   { backgroundColor: '#1e3a5f', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1.5 },
  pillText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold' },

  // AI narrative
  narrativeBox: { backgroundColor: C.bgCard, borderRadius: 8, padding: 16, borderLeft: `3px solid ${C.accent}` },
  narrativeText: { fontSize: 9, color: C.textMuted, lineHeight: 1.7 },

  // Footer
  pageFooter: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageFooterText: { fontSize: 7.5, color: C.textDim },
  pageNumber: { fontSize: 7.5, color: C.textDim },

  // Divider
  divider: { height: 1, backgroundColor: C.border, marginVertical: 16 },

  // Action plan
  actionRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottom: `1px solid ${C.border}` },
  actionNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.accentDim, justifyContent: 'center', alignItems: 'center' },
  actionNumText: { fontSize: 9, color: C.white, fontFamily: 'Helvetica-Bold' },
  actionBody: { flex: 1 },
  actionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white, marginBottom: 3 },
  actionDesc: { fontSize: 8, color: C.textMuted, lineHeight: 1.6 },
  actionSavings: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.success, textAlign: 'right' },
  actionSavingsSub: { fontSize: 7.5, color: C.textDim, textAlign: 'right' },
})

// ── Resource type display names (P13) ─────────────────────────────────────────

const RESOURCE_TYPE_LABELS = {
  virtualmachines:        'Virtual Machines',
  storageaccounts:        'Storage Accounts',
  sqlservers:             'SQL Servers',
  sqldatabases:           'SQL Databases',
  webapps:                'Web Apps',
  serverfarms:            'App Service Plans',
  functionapps:           'Function Apps',
  disks:                  'Managed Disks',
  publicipaddresses:      'Public IP Addresses',
  networkinterfaces:      'Network Interfaces',
  networksecuritygroups:  'Network Security Groups',
  virtualnetworks:        'Virtual Networks',
  loadbalancers:          'Load Balancers',
  applicationgateways:    'Application Gateways',
  vaults:                 'Key Vaults',
  // Note: microsoft.recoveryservices/vaults uses a path-aware override below
  accounts:               'Cognitive Services',
  workspaces:             'Log Analytics / ML Workspaces',
  components:             'Application Insights',
  clusters:               'Kubernetes Clusters (AKS)',
  databaseaccounts:       'Cosmos DB',
  flexibleservers:        'Flexible Servers',
  privateendpoints:       'Private Endpoints',
  privatednszones:        'Private DNS Zones',
  virtualnetworkgateways: 'VPN Gateways',
  bastionhosts:           'Azure Bastion',
  automationaccounts:     'Automation Accounts',
  eventhubnamespaces:     'Event Hubs',
  namespaces:             'Service Bus',
  containerregistries:    'Container Registries',
  containergroups:        'Container Instances',
  rediscaches:            'Redis Cache',
  searchservices:         'Azure AI Search',
  cdnprofiles:            'CDN Profiles',
  sqlpools:               'SQL Pools (Synapse)',
}

function humanType(resourceType) {
  if (!resourceType) return '—'
  const lower = resourceType.toLowerCase()
  if (lower.includes('recoveryservices')) return 'Backup Vaults'
  const last = lower.split('/').pop()
  return RESOURCE_TYPE_LABELS[last] || (last.charAt(0).toUpperCase() + last.slice(1))
}

// ── Priority calibration (P7) ──────────────────────────────────────────────────

function computePriority(rec) {
  if ((rec.score ?? 100) <= 25 || (rec.advisor_count ?? 0) >= 2) return 'High'
  if ((rec.estimated_monthly_savings ?? 0) < 5)                   return 'Low'
  return 'Medium'
}

// ── Billing date range (P10) ───────────────────────────────────────────────────

function billingDateRange(kpi) {
  const now  = new Date()
  const opts = { month: 'long', day: 'numeric', year: 'numeric' }
  if (kpi?.billing_basis === 'previous_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last  = new Date(now.getFullYear(), now.getMonth(), 0)
    return `${first.toLocaleDateString('en-US', opts)} – ${last.toLocaleDateString('en-US', opts)}`
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return `${first.toLocaleDateString('en-US', opts)} – ${now.toLocaleDateString('en-US', opts)}`
}

// ── Logo (SVG) ─────────────────────────────────────────────────────────────────
// Recreates azureopt-logo.svg using react-pdf SVG primitives

function LogoIcon({ size = 52 }) {
  return (
    <Svg width={size} height={size} viewBox="0 8 56 56">
      {/* Background rounded rect */}
      <Rect x="0" y="8" width="56" height="56" rx="12" fill="#ffffff" fillOpacity="0.15" />
      {/* Cloud shape */}
      <Path
        d="M40 38H19C16.2 38 14 35.8 14 33c0-2.4 1.7-4.4 4-4.9V28c0-3.9 3.1-7 7-7 1.9 0 3.6.7 4.9 1.9C30.8 22 32.3 21.5 34 21.5c2.9 0 5.2 2.3 5.2 5.2v.1c1.9.6 3.3 2.4 3.3 4.5C42.5 34 41.5 38 40 38z"
        fill="#ffffff"
        fillOpacity="0.9"
      />
      {/* Trend line (cost going down = savings) */}
      <Polyline
        points="17,44 23,40 30,43 40,34"
        stroke="#86efac"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Arrow head */}
      <Polyline
        points="37,32 40,34 38,37"
        stroke="#86efac"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

// ── Reusable footer ────────────────────────────────────────────────────────────

function PageFooter({ subscriptionId }) {
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.pageFooterText}>Azure Cost Optimizer  ·  {subscriptionId || 'All Subscriptions'}</Text>
      <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

// ── Cover page ─────────────────────────────────────────────────────────────────

function CoverPage({ kpi, subscriptionId, subscriptionName, generatedAt }) {
  const momSign = kpi.mom_cost_delta >= 0 ? '+' : ''
  return (
    <Page size="A4" style={s.page}>
      <View style={s.cover}>
        {/* Logo */}
        <View style={s.coverLogo}>
          <LogoIcon size={52} />
          <View style={s.coverLogoWordmark}>
            <Text style={s.coverLogoEyebrow}>AZURE</Text>
            <Text style={s.coverLogoTitle}>Cost Optimizer</Text>
            <Text style={s.coverLogoTagline}>Reduce spend · Enforce governance</Text>
          </View>
        </View>

        {/* Title block */}
        <View style={s.coverCenter}>
          <Text style={s.coverTitle}>Cost Optimization{'\n'}Report</Text>
          <Text style={s.coverSubtitle}>Infrastructure analysis and savings opportunities</Text>

          {/* Meta card */}
          <View style={s.coverMeta}>
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>Generated</Text>
              <Text style={s.coverMetaValue}>{generatedAt}</Text>
            </View>
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>Subscription</Text>
              <Text style={s.coverMetaValue}>{subscriptionName || subscriptionId || 'All Subscriptions'}</Text>
            </View>
            {subscriptionName && subscriptionId && (
              <View style={s.coverMetaRow}>
                <Text style={s.coverMetaLabel}>Subscription ID</Text>
                <Text style={{ ...s.coverMetaValue, color: C.textDim, fontFamily: 'Helvetica' }}>{subscriptionId}</Text>
              </View>
            )}
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>Resources scanned</Text>
              <Text style={s.coverMetaValue}>{kpi.total_resources?.toLocaleString()}</Text>
            </View>
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>Monthly spend</Text>
              <Text style={s.coverMetaValue}>{fmt(kpi.total_cost_current_month)}  ({momSign}{fmt(kpi.mom_cost_delta)} vs last month)</Text>
            </View>
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>Potential savings</Text>
              <Text style={{ ...s.coverMetaValue, color: C.success, fontFamily: 'Helvetica-Bold' }}>{fmt(kpi.total_potential_savings)} / month</Text>
            </View>
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>Annual savings</Text>
              <Text style={{ ...s.coverMetaValue, color: C.success }}>{fmt((kpi.total_potential_savings || 0) * 12)} projected / year</Text>
            </View>
            <View style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>Cost data period</Text>
              <Text style={s.coverMetaValue}>{billingDateRange(kpi)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.coverFooter}>This report is generated automatically and reflects data at time of scan. Review recommendations before taking action.</Text>
      </View>
    </Page>
  )
}

// ── Executive Summary ──────────────────────────────────────────────────────────

function SummaryPage({ kpi, tagCompliancePct, totalCarbon, subscriptionId }) {
  const momSign = kpi.mom_cost_delta_pct >= 0 ? '+' : ''
  const kpis = [
    { label: 'Current Month Spend',   value: fmt(kpi.total_cost_current_month),   sub: `${momSign}${pct(kpi.mom_cost_delta_pct)} vs last month` },
    { label: 'Potential Monthly Savings', value: fmt(kpi.total_potential_savings), sub: `${kpi.total_resources} resources scanned` },
    { label: 'Health Score',          value: pct(kpi.health_score_pct),            sub: 'Actively / Fully Used resources' },
    { label: 'Orphaned Resources',    value: kpi.orphan_count,                     sub: `Wasting ${fmt(kpi.orphan_cost)} / month` },
    { label: 'Tag Compliance',        value: pct(tagCompliancePct),                sub: 'Resources with required tags' },
    { label: 'Carbon Footprint',      value: `${Number(totalCarbon).toFixed(1)} kg`, sub: 'CO₂ equivalent per month' },
  ]

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Executive Summary</Text>
        </View>

        <View style={s.kpiGrid}>
          {kpis.map((k, i) => (
            <View key={i} style={s.kpiCard}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={s.kpiValue}>{k.value}</Text>
              <Text style={s.kpiSub}>{k.sub}</Text>
            </View>
          ))}
        </View>

        {/* Advisor callout */}
        {kpi.advisor_total_recs > 0 && (
          <View style={{ ...s.narrativeBox, borderLeftColor: C.warn, marginTop: 4 }}>
            <Text style={{ fontSize: 9, color: C.warn, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>
              Azure Advisor — {kpi.advisor_total_recs} recommendation{kpi.advisor_total_recs !== 1 ? 's' : ''}
            </Text>
            <Text style={s.narrativeText}>
              Azure Advisor has flagged {kpi.advisor_total_recs} items for review. These are factored into the resource scores shown in this report.
            </Text>
          </View>
        )}
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── AI Narrative ───────────────────────────────────────────────────────────────

function NarrativePage({ narrative, subscriptionId }) {
  if (!narrative) return null
  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>AI Analysis</Text>
        </View>
        <View style={s.narrativeBox}>
          <Text style={s.narrativeText}>{narrative}</Text>
        </View>
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Savings Recommendations ────────────────────────────────────────────────────

function SavingsPage({ savings, subscriptionId }) {
  const top = (savings || []).slice(0, 15)
  const priorityStyle = (p) => p === 'High' ? s.pillRed : p === 'Medium' ? s.pillYellow : s.pillBlue
  const priorityColor = (p) => p === 'High' ? '#fca5a5' : p === 'Medium' ? '#fcd34d' : '#93c5fd'

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Top Savings Opportunities</Text>
          <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>{top.length} ITEMS</Text></View>
        </View>

        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={{ ...s.tableHeadCell, flex: 2.5 }}>Resource</Text>
            <Text style={{ ...s.tableHeadCell, flex: 1.5 }}>Type</Text>
            <Text style={{ ...s.tableHeadCell, flex: 1 }}>Current</Text>
            <Text style={{ ...s.tableHeadCell, flex: 1 }}>Savings</Text>
            <Text style={{ ...s.tableHeadCell, flex: 0.8 }}>Priority</Text>
          </View>
          {top.map((r, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <View style={{ flex: 2.5 }}>
                <Text style={s.tableCell}>{r.resource_name}</Text>
                <Text style={s.tableCellMuted}>{r.resource_group}</Text>
              </View>
              <Text style={{ ...s.tableCellMuted, flex: 1.5 }}>{humanType(r.resource_type)}</Text>
              <Text style={{ ...s.tableCell, flex: 1 }}>{fmt(r.current_monthly_cost)}</Text>
              <Text style={{ ...s.tableCell, flex: 1, color: C.success, fontFamily: 'Helvetica-Bold' }}>{fmt(r.estimated_monthly_savings)}</Text>
              <View style={{ flex: 0.8 }}>
                <View style={priorityStyle(computePriority(r))}>
                  <Text style={{ ...s.pillText, color: priorityColor(computePriority(r)) }}>{computePriority(r)}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Total row */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8, gap: 16 }}>
          <Text style={{ fontSize: 9, color: C.textMuted }}>
            Top {top.length} shown — full portfolio: <Text style={{ color: C.success, fontFamily: 'Helvetica-Bold' }}>{fmt(top.reduce((sum, r) => sum + (r.estimated_monthly_savings || 0), 0))} / month</Text>
          </Text>
        </View>
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Right-Sizing ───────────────────────────────────────────────────────────────

function RightSizePage({ rightsize, subscriptionId }) {
  const top = (rightsize || []).slice(0, 12)
  if (!top.length) return null

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Right-Sizing Opportunities</Text>
          <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>{top.length} ITEMS</Text></View>
        </View>

        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={{ ...s.tableHeadCell, flex: 2 }}>Resource</Text>
            <Text style={{ ...s.tableHeadCell, flex: 1.2 }}>Current SKU</Text>
            <Text style={{ ...s.tableHeadCell, flex: 1.2 }}>Suggested SKU</Text>
            <Text style={{ ...s.tableHeadCell, flex: 0.8 }}>CPU</Text>
            <Text style={{ ...s.tableHeadCell, flex: 0.9 }}>Savings</Text>
          </View>
          {top.map((r, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <View style={{ flex: 2 }}>
                <Text style={s.tableCell}>{r.resource_name}</Text>
                <Text style={s.tableCellMuted}>{r.resource_group}</Text>
              </View>
              <Text style={{ ...s.tableCellMuted, flex: 1.2 }}>{r.current_sku}</Text>
              <Text style={{ ...s.tableCell, flex: 1.2, color: C.success }}>{r.suggested_sku}</Text>
              <Text style={{ ...s.tableCellMuted, flex: 0.8 }}>{r.cpu_pct != null ? `${r.cpu_pct.toFixed(0)}%` : '—'}</Text>
              <Text style={{ ...s.tableCell, flex: 0.9, color: C.success, fontFamily: 'Helvetica-Bold' }}>{fmt(r.estimated_savings)}</Text>
            </View>
          ))}
        </View>
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Orphaned Resources ─────────────────────────────────────────────────────────

function OrphansPage({ orphans, subscriptionId }) {
  if (!orphans?.length) return null

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Orphaned Resources</Text>
          <View style={{ ...s.sectionBadge, backgroundColor: '#450a0a' }}>
            <Text style={s.sectionBadgeText}>{orphans.length} ITEMS</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={{ ...s.tableHeadCell, flex: 2 }}>Resource</Text>
            <Text style={{ ...s.tableHeadCell, flex: 1.5 }}>Type</Text>
            <Text style={{ ...s.tableHeadCell, flex: 2 }}>Reason</Text>
            <Text style={{ ...s.tableHeadCell, flex: 0.9 }}>Monthly Cost</Text>
          </View>
          {orphans.map((r, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <View style={{ flex: 2 }}>
                <Text style={s.tableCell}>{r.resource_name}</Text>
                <Text style={s.tableCellMuted}>{r.resource_group}</Text>
              </View>
              <Text style={{ ...s.tableCellMuted, flex: 1.5 }}>{humanType(r.resource_type)}</Text>
              <Text style={{ ...s.tableCellMuted, flex: 2 }}>{r.orphan_reason}</Text>
              <Text style={{ ...s.tableCell, flex: 0.9, color: C.danger }}>{fmt(r.monthly_cost)}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8 }}>
          <Text style={{ fontSize: 9, color: C.textMuted, marginRight: 8 }}>Total orphan waste:</Text>
          <Text style={{ fontSize: 9, color: C.danger, fontFamily: 'Helvetica-Bold' }}>
            {fmt(orphans.reduce((sum, r) => sum + (r.monthly_cost || 0), 0))} / month
          </Text>
        </View>
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Cost by Resource Type ──────────────────────────────────────────────────────

function CostByTypePage({ resourceTypes, subscriptionId }) {
  const top = (resourceTypes || []).filter(r => r.cost_current_month > 0).slice(0, 15)
  if (!top.length) return null

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Cost by Resource Type</Text>
        </View>

        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={{ ...s.tableHeadCell, flex: 2.5 }}>Resource Type</Text>
            <Text style={{ ...s.tableHeadCell, flex: 0.7 }}>Count</Text>
            <Text style={{ ...s.tableHeadCell, flex: 1 }}>This Month</Text>
            <Text style={{ ...s.tableHeadCell, flex: 1 }}>Last Month</Text>
            <Text style={{ ...s.tableHeadCell, flex: 0.8 }}>Avg Score</Text>
          </View>
          {top.map((r, i) => {
            const delta = r.cost_current_month - r.cost_previous_month
            const deltaColor = delta > 0 ? C.danger : delta < 0 ? C.success : C.textMuted
            return (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={{ ...s.tableCell, flex: 2.5 }}>{r.display_name || humanType(r.resource_type)}</Text>
                <Text style={{ ...s.tableCellMuted, flex: 0.7 }}>{r.count}</Text>
                <Text style={{ ...s.tableCell, flex: 1 }}>{fmt(r.cost_current_month)}</Text>
                <Text style={{ ...s.tableCell, flex: 1, color: deltaColor }}>{fmt(r.cost_previous_month)}</Text>
                <Text style={{ ...s.tableCellMuted, flex: 0.8 }}>{r.avg_score?.toFixed(0)}</Text>
              </View>
            )
          })}
        </View>
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Reserved Instance Recommendations ─────────────────────────────────────────

function ReservationsPage({ resources, subscriptionId }) {
  const eligible = (resources || [])
    .filter(r => r.ri_eligible && (r.ri_1yr_monthly_savings > 0 || r.ri_3yr_monthly_savings > 0))
    .sort((a, b) => (b.ri_1yr_monthly_savings || 0) - (a.ri_1yr_monthly_savings || 0))
    .slice(0, 20)

  if (!eligible.length) return null

  const total1yr = eligible.reduce((s, r) => s + (r.ri_1yr_monthly_savings || 0), 0)
  const total3yr = eligible.reduce((s, r) => s + (r.ri_3yr_monthly_savings || 0), 0)

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Reserved Instance Recommendations</Text>
          <View style={{ ...s.sectionBadge, backgroundColor: '#14532d' }}>
            <Text style={s.sectionBadgeText}>{eligible.length} ELIGIBLE</Text>
          </View>
        </View>

        {/* Summary KPIs */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          <View style={{ flex: 1, backgroundColor: C.bgCard, borderRadius: 8, padding: 14, borderTop: `2px solid ${C.success}` }}>
            <Text style={s.kpiLabel}>1-Year RI Savings</Text>
            <Text style={{ ...s.kpiValue, fontSize: 18 }}>{fmt(total1yr)}/mo</Text>
            <Text style={s.kpiSub}>{fmt(total1yr * 12)} projected / year</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.bgCard, borderRadius: 8, padding: 14, borderTop: `2px solid ${C.success}` }}>
            <Text style={s.kpiLabel}>3-Year RI Savings</Text>
            <Text style={{ ...s.kpiValue, fontSize: 18 }}>{fmt(total3yr)}/mo</Text>
            <Text style={s.kpiSub}>{fmt(total3yr * 36)} projected over 3 years</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.bgCard, borderRadius: 8, padding: 14, borderTop: `2px solid ${C.accent}` }}>
            <Text style={s.kpiLabel}>Eligible Resources</Text>
            <Text style={{ ...s.kpiValue, fontSize: 18 }}>{eligible.length}</Text>
            <Text style={s.kpiSub}>Consistent workloads identified</Text>
          </View>
        </View>

        <View style={{ ...s.narrativeBox, marginBottom: 16 }}>
          <Text style={{ fontSize: 9, color: C.textMuted, lineHeight: 1.6 }}>
            Reserved Instances offer significant discounts for resources with predictable, steady-state usage.
            The resources below have been identified as strong RI candidates based on their utilization score and monthly spend.
            Committing to 1-year or 3-year terms locks in these discounts without requiring upfront payment (with flexible payment options available).
          </Text>
        </View>

        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={{ ...s.tableHeadCell, flex: 2.5 }}>Resource</Text>
            <Text style={{ ...s.tableHeadCell, flex: 1.5 }}>Type</Text>
            <Text style={{ ...s.tableHeadCell, flex: 0.9 }}>Current/mo</Text>
            <Text style={{ ...s.tableHeadCell, flex: 0.9 }}>1-yr save</Text>
            <Text style={{ ...s.tableHeadCell, flex: 0.9 }}>3-yr save</Text>
          </View>
          {eligible.map((r, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <View style={{ flex: 2.5 }}>
                <Text style={s.tableCell}>{r.resource_name}</Text>
                <Text style={s.tableCellMuted}>{r.resource_group}</Text>
              </View>
              <Text style={{ ...s.tableCellMuted, flex: 1.5 }}>{humanType(r.resource_type)}</Text>
              <Text style={{ ...s.tableCell, flex: 0.9 }}>{fmt(r.cost_current_month)}</Text>
              <Text style={{ ...s.tableCell, flex: 0.9, color: C.success, fontFamily: 'Helvetica-Bold' }}>{fmt(r.ri_1yr_monthly_savings)}</Text>
              <Text style={{ ...s.tableCell, flex: 0.9, color: C.green, fontFamily: 'Helvetica-Bold' }}>{fmt(r.ri_3yr_monthly_savings)}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 20, paddingTop: 8 }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: C.textDim }}>1-yr total savings</Text>
            <Text style={{ fontSize: 9, color: C.success, fontFamily: 'Helvetica-Bold' }}>{fmt(total1yr)}/mo · {fmt(total1yr * 12)}/yr</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: C.textDim }}>3-yr total savings</Text>
            <Text style={{ fontSize: 9, color: C.green, fontFamily: 'Helvetica-Bold' }}>{fmt(total3yr)}/mo · {fmt(total3yr * 36)} over 3yrs</Text>
          </View>
        </View>
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Action Plan ────────────────────────────────────────────────────────────────

const PHASE_COLORS = {
  immediate: C.danger,
  verify:    C.warn,
  tag:       C.accent,
  wait:      C.textDim,
  delete:    C.danger,
  downsize:  C.success,
}

function ActionPlanPage({ savings, resources, subscriptionId }) {
  // Build resource lookup by id for safe_action_steps (P6)
  const resourceMap = {}
  ;(resources || []).forEach(r => {
    if (r.resource_id) resourceMap[r.resource_id.toLowerCase()] = r
  })

  const priorityColor = (p) => p === 'High' ? C.danger : p === 'Medium' ? C.warn : C.accent

  // Only include scored (non-Unknown) items with real savings (P8)
  const actionable = (savings || [])
    .filter(r => {
      const res = resourceMap[r.resource_id?.toLowerCase()]
      return (res?.score_label !== 'Unknown') && (r.estimated_monthly_savings > 0)
    })
    .sort((a, b) => (b.estimated_monthly_savings || 0) - (a.estimated_monthly_savings || 0))
    .slice(0, 10)

  if (!actionable.length) return null

  const totalSavings = actionable.reduce((sum, r) => sum + (r.estimated_monthly_savings || 0), 0)

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Prioritized Action Plan</Text>
          <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>TOP {actionable.length}</Text></View>
        </View>

        <View style={{ ...s.narrativeBox, marginBottom: 16 }}>
          <Text style={{ fontSize: 9, color: C.textMuted, lineHeight: 1.6 }}>
            Ranked by estimated monthly savings. Only resources with confirmed utilisation data are included here.
            Resources without diagnostics enabled appear in the Data Quality section at the end of this report.
          </Text>
        </View>

        {actionable.map((r, i) => {
          const res      = resourceMap[r.resource_id?.toLowerCase()]
          const steps    = (res?.safe_action_steps || []).slice(0, 3)
          const priority = computePriority(r)
          return (
            <View key={i} style={s.actionRow} wrap={false}>
              <View style={s.actionNum}>
                <Text style={s.actionNumText}>{i + 1}</Text>
              </View>
              <View style={s.actionBody}>
                <Text style={s.actionTitle}>{r.resource_name}</Text>
                <Text style={{ fontSize: 7.5, color: priorityColor(priority), fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>
                  {priority.toUpperCase()} PRIORITY  ·  {humanType(r.resource_type)}  ·  {r.resource_group}
                </Text>
                <Text style={s.actionDesc}>{r.recommendation || r.ai_action || 'Review resource with owning team.'}</Text>
                {/* Step-by-step actions (P6) */}
                {steps.length > 0 && (
                  <View style={{ marginTop: 5, gap: 3 }}>
                    {steps.map((step, si) => (
                      <View key={si} style={{ flexDirection: 'row', gap: 5, alignItems: 'flex-start' }}>
                        <View style={{ backgroundColor: PHASE_COLORS[step.phase] || C.accentDim, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1, marginTop: 1 }}>
                          <Text style={{ fontSize: 5.5, color: C.white, fontFamily: 'Helvetica-Bold' }}>{(step.phase || 'step').toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.text }}>{step.title}</Text>
                          {step.detail && <Text style={{ fontSize: 6.5, color: C.textMuted, lineHeight: 1.4 }}>{step.detail?.slice(0, 160)}{step.detail?.length > 160 ? '…' : ''}</Text>}
                          {step.az_cli && <Text style={{ fontSize: 6, color: C.textDim, fontFamily: 'Courier', marginTop: 1 }}>{step.az_cli}</Text>}
                        </View>
                      </View>
                    ))}
                    {(res?.safe_action_steps || []).length > 3 && (
                      <Text style={{ fontSize: 6.5, color: C.textDim, marginTop: 2 }}>+{(res.safe_action_steps.length - 3)} more steps — see full plan in the web dashboard.</Text>
                    )}
                  </View>
                )}
              </View>
              <View style={{ width: 70, alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 2 }}>
                <Text style={s.actionSavings}>{fmt(r.estimated_monthly_savings)}</Text>
                <Text style={s.actionSavingsSub}>per month</Text>
                <Text style={{ fontSize: 7, color: C.textDim, textAlign: 'right', marginTop: 2 }}>{fmt(r.estimated_monthly_savings * 12)}/yr</Text>
              </View>
            </View>
          )
        })}

        {/* Fixed total label (P4) */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: C.textMuted, marginRight: 8 }}>Top {actionable.length} actions total:</Text>
          <Text style={{ fontSize: 9, color: C.success, fontFamily: 'Helvetica-Bold' }}>{fmt(totalSavings)} / month</Text>
        </View>
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Data Quality page (P8) ─────────────────────────────────────────────────────

function DataQualityPage({ resources, subscriptionId }) {
  const noData = (resources || [])
    .filter(r => r.score_label === 'Unknown' && (r.cost_current_month > 0 || r.cost_previous_month > 0))
    .sort((a, b) => (b.cost_current_month || 0) - (a.cost_current_month || 0))

  if (!noData.length) return null

  // Group by resource group
  const byRG = {}
  noData.forEach(r => {
    const rg = r.resource_group || 'Unknown RG'
    if (!byRG[rg]) byRG[rg] = []
    byRG[rg].push(r)
  })
  const groups = Object.entries(byRG).sort((a, b) => b[1].length - a[1].length).slice(0, 8)

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Data Quality — Diagnostics Not Enabled</Text>
          <View style={{ ...s.sectionBadge, backgroundColor: '#451a03' }}>
            <Text style={s.sectionBadgeText}>{noData.length} RESOURCES</Text>
          </View>
        </View>

        <View style={{ ...s.narrativeBox, borderLeftColor: C.warn, marginBottom: 16 }}>
          <Text style={{ fontSize: 9, color: C.warn, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>Action required before optimization</Text>
          <Text style={{ fontSize: 8.5, color: C.textMuted, lineHeight: 1.6 }}>
            The {noData.length} resource{noData.length !== 1 ? 's' : ''} below have no Azure Monitor diagnostic data.
            Without metrics, utilisation scores cannot be calculated — these resources cannot be confidently recommended for deletion or right-sizing.{'\n'}
            Fix: Azure Portal  Resource  Diagnostic settings  + Add diagnostic setting  Send to Log Analytics or Storage Account.{'\n'}
            After 24–48 hours, refresh the scan to receive accurate scores and data-backed recommendations.
          </Text>
        </View>

        {groups.map(([rg, rgResources], gi) => (
          <View key={gi} style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {rg}  ({rgResources.length})
            </Text>
            {rgResources.slice(0, 6).map((r, ri) => (
              <View key={ri} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: `1px solid ${C.border}` }}>
                <View style={{ flex: 2 }}>
                  <Text style={{ fontSize: 8, color: C.text }}>{r.resource_name}</Text>
                  <Text style={{ fontSize: 7, color: C.textDim }}>{humanType(r.resource_type)}</Text>
                </View>
                <Text style={{ fontSize: 8, color: C.textMuted, flex: 0.8, textAlign: 'right' }}>{fmt(r.cost_current_month)}/mo</Text>
              </View>
            ))}
            {rgResources.length > 6 && (
              <Text style={{ fontSize: 7, color: C.textDim, marginTop: 3 }}>+{rgResources.length - 6} more in this resource group</Text>
            )}
          </View>
        ))}
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Resource Group Summary (P11) ───────────────────────────────────────────────

function RGSummaryPage({ resources, kpi, subscriptionId }) {
  if (!resources?.length) return null

  const rgMap = {}
  resources.forEach(r => {
    const rg = r.resource_group || 'Unknown'
    if (!rgMap[rg]) rgMap[rg] = { name: rg, cost: 0, savings: 0, count: 0, worstScore: 100 }
    rgMap[rg].cost    += r.cost_current_month || 0
    rgMap[rg].savings += r.estimated_monthly_savings || 0
    rgMap[rg].count   += 1
    const sc = r.final_score ?? 100
    if (sc < rgMap[rg].worstScore) rgMap[rg].worstScore = sc
  })

  const sorted = Object.values(rgMap).sort((a, b) => b.savings - a.savings).slice(0, 10)
  const maxCost = Math.max(...sorted.map(r => r.cost), 0.01)
  const totalCost = kpi?.total_cost_current_month || 1

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Spend by Resource Group</Text>
          <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>TOP {sorted.length}</Text></View>
        </View>

        <View style={{ ...s.narrativeBox, marginBottom: 16 }}>
          <Text style={{ fontSize: 9, color: C.textMuted, lineHeight: 1.6 }}>
            Resource groups typically map to teams or projects. Use this breakdown to direct conversations to the right owners — each group shows total spend, estimated waste, and % of the subscription bill.
          </Text>
        </View>

        {sorted.map((rg, i) => {
          const barWidth = Math.max(4, (rg.cost / maxCost) * 340)
          const billPct  = ((rg.cost / totalCost) * 100).toFixed(1)
          const barColor = rg.worstScore <= 25 ? C.danger : rg.worstScore <= 50 ? C.warn : C.accent
          return (
            <View key={i} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.text, flex: 2 }}>{rg.name}</Text>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 8, color: C.textMuted }}>{rg.count} resources</Text>
                  <Text style={{ fontSize: 8, color: C.textDim }}>{billPct}% of bill</Text>
                  {rg.savings > 0 && <Text style={{ fontSize: 8, color: C.success, fontFamily: 'Helvetica-Bold' }}>{fmt(rg.savings)} saveable</Text>}
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Svg width={340} height={10}>
                  <Rect x={0} y={1} width={340} height={8} fill={C.bgLight} rx={3} />
                  <Rect x={0} y={1} width={barWidth} height={8} fill={barColor} rx={3} />
                </Svg>
                <Text style={{ fontSize: 8.5, color: C.text, fontFamily: 'Helvetica-Bold', width: 60 }}>{fmt(rg.cost)}/mo</Text>
              </View>
            </View>
          )
        })}
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Charts page (P5) ───────────────────────────────────────────────────────────

function ChartsPage({ scoreDistribution, resourceTypes, kpi, subscriptionId }) {
  const scoreDist  = (scoreDistribution || []).filter(d => d.count > 0)
  const totalScore = scoreDist.reduce((s, d) => s + d.count, 0)
  const topTypes   = (resourceTypes || []).filter(r => r.cost_current_month > 0).slice(0, 8)
  const maxTypeCost = Math.max(...topTypes.map(r => r.cost_current_month), 0.01)

  if (!scoreDist.length && !topTypes.length) return null

  // Build stacked bar segments
  let xOff = 0
  const BAR_W = 460
  const segments = scoreDist.map(d => {
    const w = totalScore > 0 ? (d.count / totalScore) * BAR_W : 0
    const seg = { x: xOff, w, color: d.color || C.accent, label: d.label, count: d.count, cost: d.total_cost }
    xOff += w
    return seg
  })

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Portfolio Overview — Charts</Text>
        </View>

        {/* Score distribution */}
        {scoreDist.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 10 }}>Resource Score Distribution</Text>
            <Svg width={BAR_W} height={24}>
              {segments.map((seg, i) => (
                <Rect key={i} x={seg.x} y={0} width={Math.max(seg.w, 1)} height={24} fill={seg.color} />
              ))}
            </Svg>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              {segments.map((seg, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Svg width={10} height={10}><Rect x={0} y={0} width={10} height={10} fill={seg.color} rx={2} /></Svg>
                  <Text style={{ fontSize: 7.5, color: C.textMuted }}>{seg.label}: <Text style={{ color: C.text, fontFamily: 'Helvetica-Bold' }}>{seg.count}</Text> ({fmt(seg.cost)}/mo)</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Cost by resource type */}
        {topTypes.length > 0 && (
          <View>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 10 }}>Monthly Spend by Resource Type</Text>
            {topTypes.map((r, i) => {
              const barW = Math.max(4, (r.cost_current_month / maxTypeCost) * 340)
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 8, color: C.textMuted, width: 130 }}>{r.display_name || humanType(r.resource_type)}</Text>
                  <Svg width={340} height={14}>
                    <Rect x={0} y={2} width={340} height={10} fill={C.bgLight} rx={3} />
                    <Rect x={0} y={2} width={barW} height={10} fill={C.accent} rx={3} />
                  </Svg>
                  <Text style={{ fontSize: 8.5, color: C.text, fontFamily: 'Helvetica-Bold', width: 55, textAlign: 'right' }}>{fmt(r.cost_current_month)}</Text>
                </View>
              )
            })}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
              <Text style={{ fontSize: 8, color: C.textDim }}>Based on {kpi?.billing_basis === 'previous_month' ? 'previous full month' : 'current month to date'}</Text>
            </View>
          </View>
        )}
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── Glossary (P12) ─────────────────────────────────────────────────────────────

function GlossaryPage({ subscriptionId }) {
  const terms = [
    { term: 'Not Used (score 0–25)',      def: 'Resource shows no activity signal and no utilisation metrics confirm usage. High-confidence waste. Safe to review for decommission.' },
    { term: 'Rarely Used (score 26–50)',  def: 'Some metrics available but utilization is very low. Candidate for right-sizing or team review before any action.' },
    { term: 'Actively Used (score 51–75)', def: 'Resource shows moderate to good utilization. Not a delete candidate — monitor for right-sizing opportunities.' },
    { term: 'Fully Used (score 76–100)',  def: 'Resource is heavily utilized. No optimization action recommended at this time.' },
    { term: 'Unknown',                    def: 'No Azure Monitor diagnostic data is available. The tool cannot score this resource accurately. Enable diagnostics and rescan.' },
    { term: 'Health Score',              def: 'Percentage of scorable resources (excluding Unknown) that are Actively or Fully Used. 100% = all scored resources are in active use.' },
    { term: 'Efficiency Grade (A–F)',     def: 'Composite grade based on Health Score, confirmed waste cost, orphan count, and Advisor recommendations. A = excellent, F = critical action needed.' },
    { term: 'Orphaned Resource',         def: 'A resource with no parent or dependent — e.g. an unattached managed disk, a NIC with no VM, a public IP with no association. Safe delete candidate.' },
    { term: 'Reserved Instance (RI)',     def: 'A 1-year or 3-year commitment to use a specific resource type in a specific region, in exchange for a discount of up to 72% vs. pay-as-you-go.' },
    { term: 'Azure Savings Plan',        def: 'A flexible spend commitment ($/hour) that applies across resource types and regions. More flexible than RIs, typically 15–65% discount.' },
    { term: 'PTU (Provisioned Throughput)', def: 'Azure OpenAI Provisioned Throughput Units — flat-fee capacity reservation. Low utilization on PTU is a reservation waste issue, not a delete candidate.' },
    { term: 'Cost Management Reader',    def: 'The Azure RBAC role required to read billing data. This tool requires Reader + Cost Management Reader + Monitoring Reader only. No write access ever.' },
    { term: 'Read-Only Guarantee',       def: 'This tool never modifies, deletes, or creates any Azure resource. All action steps are recommendations only — the user executes via Azure Portal or CLI.' },
  ]

  return (
    <Page size="A4" style={s.page}>
      <View style={s.inner}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Glossary and Scoring Legend</Text>
        </View>

        <View style={{ ...s.narrativeBox, borderLeftColor: C.success, marginBottom: 16 }}>
          <Text style={{ fontSize: 8.5, color: C.textMuted, lineHeight: 1.5 }}>
            This page defines the terms, score labels, and metrics used throughout this report. Share with stakeholders who are new to cloud cost optimization.
          </Text>
        </View>

        {terms.map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6, borderBottom: `1px solid ${C.border}` }}>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.text, width: 150, flexShrink: 0 }}>{t.term}</Text>
            <Text style={{ fontSize: 8.5, color: C.textMuted, flex: 1, lineHeight: 1.5 }}>{t.def}</Text>
          </View>
        ))}
      </View>
      <PageFooter subscriptionId={subscriptionId} />
    </Page>
  )
}

// ── PDF Document ───────────────────────────────────────────────────────────────

function ReportDocument({ data }) {
  const activeSub   = data.active_subscription_id
    ? data.subscriptions?.find(s => s.subscription_id === data.active_subscription_id)
    : data.subscriptions?.[0]
  const subId       = activeSub?.subscription_id || ''
  const subName     = activeSub?.subscription_name || ''
  const subLabel    = subName || (subId ? `${subId.slice(0, 8)}…` : 'All Subscriptions')
  const generatedAt = date()

  return (
    <Document
      title="Azure Cost Optimization Report"
      author="Azure Cost Optimizer"
      subject={`Cost analysis for ${subName || subId || 'all subscriptions'}`}
    >
      <CoverPage        kpi={data.kpi} subscriptionId={subId} subscriptionName={subName} generatedAt={generatedAt} />
      <SummaryPage      kpi={data.kpi} tagCompliancePct={data.tag_compliance_pct} totalCarbon={data.total_carbon_kg} subscriptionId={subLabel} />
      {data.ai_narrative && <NarrativePage narrative={data.ai_narrative} subscriptionId={subLabel} />}
      <ChartsPage       scoreDistribution={data.score_distribution} resourceTypes={data.resource_type_summary} kpi={data.kpi} subscriptionId={subLabel} />
      <ActionPlanPage   savings={data.savings_recommendations} resources={data.resources} subscriptionId={subLabel} />
      <SavingsPage      savings={data.savings_recommendations} subscriptionId={subLabel} />
      <RGSummaryPage    resources={data.resources} kpi={data.kpi} subscriptionId={subLabel} />
      <ReservationsPage resources={data.resources} subscriptionId={subLabel} />
      <RightSizePage    rightsize={data.rightsize_opportunities} subscriptionId={subLabel} />
      <OrphansPage      orphans={data.orphans} subscriptionId={subLabel} />
      <CostByTypePage   resourceTypes={data.resource_type_summary} subscriptionId={subLabel} />
      <DataQualityPage  resources={data.resources} subscriptionId={subLabel} />
      <GlossaryPage     subscriptionId={subLabel} />
    </Document>
  )
}

// ── Export button ──────────────────────────────────────────────────────────────

export default function ExportPDFButton({ data }) {
  const [generating, setGenerating] = useState(false)

  async function handleExport() {
    if (!data || generating) return
    setGenerating(true)
    try {
      const blob     = await pdf(<ReportDocument data={data} />).toBlob()
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      const subId    = data.active_subscription_id || data.subscriptions?.[0]?.subscription_id || 'report'
      a.href         = url
      a.download     = `azure-cost-report-${subId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={!data || generating}
      title="Export PDF report"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/60 hover:bg-gray-700/60 text-xs text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {generating
        ? <><Loader size={13} className="animate-spin" /> Generating…</>
        : <><FileDown size={13} /> Export PDF</>
      }
    </button>
  )
}
