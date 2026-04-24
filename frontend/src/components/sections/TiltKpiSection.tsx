import type { TiltKpiMetrics } from '../../services/dashboardService'

interface TiltKpiSectionProps {
  metrics: TiltKpiMetrics
}

function TiltKpiSection({ metrics }: TiltKpiSectionProps) {
  return (
    <div className="tilt-kpi-section">
      <div className="tilt-kpi-container">
        <div className="tilt-kpi-box tilt-kpi-safe">
          <span className="tilt-kpi-emoji">🟢</span>
          <div className="tilt-kpi-content">
            <p className="tilt-kpi-label">Safe %</p>
            <p className="tilt-kpi-value">{metrics.safePercentage.toFixed(0)}%</p>
          </div>
        </div>

        <div className="tilt-kpi-box tilt-kpi-warning">
          <span className="tilt-kpi-emoji">🟡</span>
          <div className="tilt-kpi-content">
            <p className="tilt-kpi-label">Warning %</p>
            <p className="tilt-kpi-value">{metrics.warningPercentage.toFixed(0)}%</p>
          </div>
        </div>

        <div className="tilt-kpi-box tilt-kpi-unsafe">
          <span className="tilt-kpi-emoji">🔴</span>
          <div className="tilt-kpi-content">
            <p className="tilt-kpi-label">Unsafe %</p>
            <p className="tilt-kpi-value">{metrics.unsafePercentage.toFixed(0)}%</p>
          </div>
        </div>

        <div className="tilt-kpi-box tilt-kpi-alerts">
          <span className="tilt-kpi-emoji">⚠️</span>
          <div className="tilt-kpi-content">
            <p className="tilt-kpi-label">Alerts</p>
            <p className="tilt-kpi-value">{metrics.alertCount} events</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TiltKpiSection
