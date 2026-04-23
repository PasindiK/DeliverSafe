import { useMemo, useState } from 'react'
import type { AlertItem, AlertSeverity, AlertStatus } from '../../types/dashboard'

interface AlertTableProps {
  alerts: AlertItem[]
  title?: string
  subtitle?: string
  enableControls?: boolean
  showStatus?: boolean
}

type SortKey = 'time' | 'bagId' | 'route' | 'issue' | 'severity' | 'status'

const SEVERITY_WEIGHT: Record<AlertSeverity, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
}

const STATUS_WEIGHT: Record<AlertStatus, number> = {
  Open: 3,
  Investigating: 2,
  Monitoring: 1,
}

function AlertTable({
  alerts,
  title = 'Recent Alerts',
  subtitle = 'Latest anomaly events to support triage decisions',
  enableControls = false,
  showStatus = false,
}: AlertTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AlertSeverity>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | AlertStatus>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const visibleAlerts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    const filtered = alerts.filter((alert) => {
      const severityMatch = severityFilter === 'ALL' || alert.severity === severityFilter
      const statusMatch = statusFilter === 'ALL' || alert.status === statusFilter
      const searchMatch =
        normalizedSearch.length === 0 ||
        [alert.time, alert.bagId, alert.route, alert.issue, alert.severity, alert.status]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)

      return severityMatch && statusMatch && searchMatch
    })

    return filtered.sort((first, second) => {
      let compareValue = 0

      if (sortKey === 'time') {
        compareValue = new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime()
      } else if (sortKey === 'bagId') {
        compareValue = first.bagId.localeCompare(second.bagId)
      } else if (sortKey === 'route') {
        compareValue = first.route.localeCompare(second.route)
      } else if (sortKey === 'issue') {
        compareValue = first.issue.localeCompare(second.issue)
      } else if (sortKey === 'severity') {
        compareValue = SEVERITY_WEIGHT[first.severity] - SEVERITY_WEIGHT[second.severity]
      } else {
        compareValue = STATUS_WEIGHT[first.status] - STATUS_WEIGHT[second.status]
      }

      return sortDirection === 'asc' ? compareValue : -compareValue
    })
  }, [alerts, searchQuery, severityFilter, sortKey, sortDirection, statusFilter])

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          <p className="panel-subtitle">{subtitle}</p>
        </div>
        <span className="table-chip">{visibleAlerts.length} events</span>
      </div>

      {enableControls ? (
        <div className="table-controls" role="group" aria-label="Alert table controls">
          <label className="table-control table-control-search">
            <span>Search</span>
            <input
              type="search"
              value={searchQuery}
              placeholder="Search bag, route, issue"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>

          <label className="table-control">
            <span>Severity</span>
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as 'ALL' | AlertSeverity)}
            >
              <option value="ALL">All</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>

          <label className="table-control">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'ALL' | AlertStatus)}
            >
              <option value="ALL">All</option>
              <option value="Open">Open</option>
              <option value="Investigating">Investigating</option>
              <option value="Monitoring">Monitoring</option>
            </select>
          </label>

          <label className="table-control">
            <span>Sort By</span>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="time">Time</option>
              <option value="bagId">Bag ID</option>
              <option value="route">Route</option>
              <option value="issue">Issue Type</option>
              <option value="severity">Severity</option>
              <option value="status">Status</option>
            </select>
          </label>

          <button
            type="button"
            className="table-sort-direction"
            onClick={() => setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          </button>
        </div>
      ) : null}

      {visibleAlerts.length === 0 ? (
        <div className="empty-state">No alerts to display for selected filters.</div>
      ) : (
        <div className="table-wrap">
          <table className="alert-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Bag ID</th>
                <th>Route</th>
                <th>Issue Type</th>
                <th>Severity</th>
                {showStatus ? <th>Status</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleAlerts.map((alert) => (
                <tr key={alert.id} className={`row-${alert.severity.toLowerCase()}`}>
                  <td className="cell-time">{alert.time}</td>
                  <td>
                    <span className="bag-pill">{alert.bagId}</span>
                  </td>
                  <td>{alert.route}</td>
                  <td className="issue-cell">{alert.issue}</td>
                  <td>
                    <span className={`severity severity-${alert.severity.toLowerCase()}`}>
                      {alert.severity}
                    </span>
                  </td>
                  {showStatus ? (
                    <td>
                      <span className={`status-badge status-${alert.status.toLowerCase()}`}>
                        {alert.status}
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default AlertTable
