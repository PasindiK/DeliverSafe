import type { KpiMetric } from '../../types/dashboard'

interface KpiCardProps {
  metric: KpiMetric
}

function KpiCard({ metric }: KpiCardProps) {
  const trendSymbol =
    metric.trendDirection === 'up' ? '▲' : metric.trendDirection === 'down' ? '▼' : '•'

  return (
    <article className={`kpi-card kpi-tone-${metric.tone}`}>
      <div className="kpi-card-top">
        <p className="kpi-label">{metric.label}</p>
        <span className="kpi-dot" aria-hidden="true" />
      </div>
      <p className="kpi-value">{metric.value}</p>
      <p className="kpi-helper">{metric.helper}</p>
      <p className={`kpi-trend kpi-trend-${metric.trendDirection}`}>
        <span aria-hidden="true">{trendSymbol}</span> {metric.trendText}
      </p>
    </article>
  )
}

export default KpiCard
