import { useMemo, useState } from 'react'
import DashboardFilters from '../../components/filters/DashboardFilters'
import AlertTable from '../../components/lists/AlertTable'
import PageTabs from '../../components/navigation/PageTabs'
import {
  buildAlertItems,
  defaultDashboardFilters,
  filterRecords,
} from '../../services/dashboardService'
import type { SensorRecord } from '../../types/dashboard'

const alertsPageDefaultFilters = {
  ...defaultDashboardFilters,
  anomaliesOnly: true,
}

interface AlertsPageProps {
  records: SensorRecord[]
}

function AlertsPage({ records }: AlertsPageProps) {
  const [filters, setFilters] = useState(alertsPageDefaultFilters)

  const bagOptions = useMemo(() => {
    return Array.from(new Set(records.map((record) => record.bagId)))
  }, [records])

  const routeOptions = useMemo(() => {
    return Array.from(new Set(records.map((record) => record.route)))
  }, [records])

  const filteredRecords = useMemo(() => {
    return filterRecords(records, filters)
  }, [records, filters])

  const alerts = useMemo(() => {
    return buildAlertItems(filteredRecords, 40)
  }, [filteredRecords])

  const highSeverityCount = useMemo(() => {
    return alerts.filter((alert) => alert.severity === 'High').length
  }, [alerts])

  const mediumSeverityCount = useMemo(() => {
    return alerts.filter((alert) => alert.severity === 'Medium').length
  }, [alerts])

  const lowSeverityCount = useMemo(() => {
    return alerts.filter((alert) => alert.severity === 'Low').length
  }, [alerts])

  const latestAlertTime = alerts[0]?.time ?? 'No alerts in selection'

  return (
    <main className="dashboard-shell">
      <header className="page-header panel">
        <p className="eyebrow">Alerts & Incidents</p>
        <h1>Alerts & Anomaly Triage</h1>
        <p className="dashboard-subtitle">
          Focused page for operations teams to filter, prioritize, and respond to critical events with
          clear severity visibility.
        </p>
        <PageTabs />
      </header>

      <DashboardFilters
        filters={filters}
        bagOptions={bagOptions}
        routeOptions={routeOptions}
        onChange={setFilters}
      />

      <section className="quick-stats-grid alert-summary-grid">
        <article className="quick-stat-card quick-stat-critical">
          <p className="quick-stat-label">High Severity Alerts</p>
          <p className="quick-stat-value">{highSeverityCount}</p>
        </article>

        <article className="quick-stat-card quick-stat-warning">
          <p className="quick-stat-label">Medium Severity Alerts</p>
          <p className="quick-stat-value">{mediumSeverityCount}</p>
        </article>

        <article className="quick-stat-card quick-stat-safe">
          <p className="quick-stat-label">Low Severity Alerts</p>
          <p className="quick-stat-value">{lowSeverityCount}</p>
        </article>

        <article className="quick-stat-card">
          <p className="quick-stat-label">Latest Alert Time</p>
          <p className="quick-stat-value quick-stat-small">{latestAlertTime}</p>
        </article>
      </section>

      <AlertTable
        alerts={alerts}
        title="Alert Event Log"
        subtitle="Search, filter, and sort incidents for rapid operational triage"
        enableControls
        showStatus
      />
    </main>
  )
}

export default AlertsPage
