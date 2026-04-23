import { useMemo } from 'react'
import { Outlet } from 'react-router-dom'
import type { SensorRecord } from '../../types/dashboard'

interface AppLayoutProps {
  records: SensorRecord[]
}

function AppLayout({ records }: AppLayoutProps) {
  const lastUpdatedLabel = useMemo(() => {
    if (records.length === 0) {
      return 'Waiting for sensor data'
    }

    return new Date(records[records.length - 1].timestamp).toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [records])

  return (
    <div className="app-layout">
      <header className="app-nav-wrap">
        <div className="app-nav-inner">
          <div className="app-brand">
            <p className="app-brand-title">Smart Delivery Monitoring</p>
            <p className="app-brand-subtitle">IoT Food Quality Analytics</p>
          </div>

          <div className="app-system-meta" aria-label="System status">
            <span className="app-updated-at">Last updated: {lastUpdatedLabel}</span>
            <span className="app-system-status">
              <span className="app-status-dot" aria-hidden="true" />
              Online
            </span>
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  )
}

export default AppLayout
