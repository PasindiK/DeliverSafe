import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LeakBagDistributionItem, LeakStatusSummary, LeakTrendPoint } from '../../types/dashboard'

interface LeakDetectionStatusCardProps {
  summary: LeakStatusSummary
  trendData: LeakTrendPoint[]
  leakDistributionData: LeakBagDistributionItem[]
}

function LeakDetectionStatusCard({
  summary,
  trendData,
  leakDistributionData,
}: LeakDetectionStatusCardProps) {
  const isCritical = summary.currentStatus === 'LEAK DETECTED'
  const leakTrendWindow = trendData.slice(-24)
  const topLeakBags = leakDistributionData.slice(0, 8)

  const latestLeakTimeLabel = summary.latestIncidentAt
    ? new Date(summary.latestIncidentAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'None'

  const peakTrendPoint = leakTrendWindow.reduce<LeakTrendPoint | null>((peak, point) => {
    if (!peak || point.incidentCount > peak.incidentCount) return point
    return peak
  }, null)

  const peakTrendLabel =
    peakTrendPoint && peakTrendPoint.incidentCount > 0
      ? `${peakTrendPoint.time} (${peakTrendPoint.incidentCount})`
      : 'No leak peaks detected'

  return (
    <section className={`panel leak-status-card ${isCritical ? 'leak-critical' : 'leak-safe'}`}>
      <div className="leak-status-head">
        <h2 className="panel-title">Leak Detection Status</h2>
        <span className={`leak-status-pill ${isCritical ? 'leak-pill-critical' : 'leak-pill-safe'}`}>
          {isCritical ? 'ACTIVE LEAK DETECTED' : 'SAFE'}
        </span>
      </div>

      <p className="leak-status-description">
        {isCritical
          ? 'Active leak incidents are currently detected and require immediate action.'
          : 'No active leak incidents detected across monitored delivery bags.'}
      </p>

      <div className={`leak-live-panel ${isCritical ? 'leak-live-critical' : 'leak-live-safe'}`}>
        <h3 className="leak-live-title">Live Status Panel</h3>
        {isCritical ? (
          <>
            <p className="leak-live-status">🔴 ACTIVE LEAK DETECTED</p>
            <p className="leak-live-row">
              <strong>Bag:</strong> {summary.latestIncidentBagId ?? 'N/A'}
            </p>
            <p className="leak-live-row">
              <strong>Time:</strong> {latestLeakTimeLabel}
            </p>
          </>
        ) : (
          <>
            <p className="leak-live-row">
              <strong>Active Leaks:</strong> {summary.activeIncidentCount}
            </p>
            <p className="leak-live-row">
              <strong>Last Leak:</strong> {summary.latestIncidentAt ? latestLeakTimeLabel : 'None'}
            </p>
          </>
        )}
      </div>

      <div className="leak-trend-block">
        <h3 className="leak-section-title">2. Leak Events Over Time (Trend Analysis)</h3>
        <p className="leak-viva-line">This helps identify temporal patterns in leak occurrences.</p>
        {leakTrendWindow.length === 0 ? (
          <div className="empty-state">No leak trend data in current view.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={leakTrendWindow} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#d7dfeb" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="incidentCount"
                  name="Leak Count"
                  stroke="#dc2626"
                  strokeWidth={2.6}
                  dot={{ r: 2.8 }}
                  activeDot={{ r: 4.2 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="leak-peak-note">
              <strong>Peak hour:</strong> {peakTrendLabel}
            </p>
          </>
        )}
      </div>

      <div className="leak-distribution-block">
        <h3 className="leak-section-title">3. Leak Distribution by Bag (Behavior Analysis)</h3>
        {topLeakBags.length === 0 ? (
          <div className="empty-state">No bag-level leak counts in current view.</div>
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={topLeakBags} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#d7dfeb" />
              <XAxis dataKey="bagId" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="leakCount" name="Leak Count" radius={[8, 8, 0, 0]}>
                {topLeakBags.map((item) => (
                  <Cell key={item.bagId} fill="#2563eb" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

export default LeakDetectionStatusCard
