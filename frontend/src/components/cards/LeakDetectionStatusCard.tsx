import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LeakStatusSummary, LeakTrendPoint } from '../../types/dashboard'

interface LeakDetectionStatusCardProps {
  summary: LeakStatusSummary
  trendData: LeakTrendPoint[]
}

function LeakDetectionStatusCard({ summary, trendData }: LeakDetectionStatusCardProps) {
  const isCritical = summary.currentStatus === 'LEAK DETECTED'
  const latestIncidentLabel = summary.latestIncidentAt
    ? `${new Date(summary.latestIncidentAt).toLocaleString()}${
        summary.latestIncidentBagId ? ` (${summary.latestIncidentBagId})` : ''
      }`
    : 'No leak incidents in selected time range'

  const leakTrendWindow = trendData.slice(-24)

  return (
    <section className={`panel leak-status-card ${isCritical ? 'leak-critical' : 'leak-safe'}`}>
      <div className="leak-status-head">
        <h2 className="panel-title">Leak Detection Status</h2>
        <span className={`leak-status-pill ${isCritical ? 'leak-pill-critical' : 'leak-pill-safe'}`}>
          {summary.currentStatus}
        </span>
      </div>

      <p className="leak-status-description">
        {isCritical
          ? 'Immediate operational action is required to mitigate product quality risks.'
          : 'No active leak incidents detected across monitored delivery bags.'}
      </p>

      <div className="leak-metric-grid">
        <article className="leak-metric-card">
          <p className="leak-metric-label">Active Incidents</p>
          <p className="leak-metric-value">{summary.activeIncidentCount}</p>
        </article>
        <article className="leak-metric-card">
          <p className="leak-metric-label">Recent Leak Events</p>
          <p className="leak-metric-value">{summary.recentIncidentCount}</p>
        </article>
        <article className="leak-metric-card">
          <p className="leak-metric-label">Last 12 Hours</p>
          <p className="leak-metric-value">{summary.recentIncidentCountLast12h}</p>
        </article>
      </div>

      <p className="leak-impacted-bags">
        <strong>Impacted Bags:</strong>{' '}
        {summary.impactedBags.length === 0 ? 'None' : summary.impactedBags.join(', ')}
      </p>

      <p className="leak-latest-incident">
        <strong>Latest Incident:</strong> {latestIncidentLabel}
      </p>

      <div className="leak-trend-block">
        <p className="leak-trend-label">Hourly leak activity (last 24 points)</p>
        {leakTrendWindow.length === 0 ? (
          <div className="empty-state">No leak trend data in current view.</div>
        ) : (
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={leakTrendWindow} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#d7dfeb" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="incidentCount"
                name="Leak events"
                stroke="#DC2626"
                fill="#FEE2E2"
              />
              <Area
                type="monotone"
                dataKey="impactedBagCount"
                name="Impacted bags"
                stroke="#7F1D1D"
                fill="rgba(127, 29, 29, 0.12)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

export default LeakDetectionStatusCard
