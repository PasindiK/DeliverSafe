import { useMemo } from 'react'
import type { BagLidEventPoint } from '../../types/dashboard'

interface BagOpenCloseTimelineProps {
  data: BagLidEventPoint[]
}

type BagStatusTone = 'start' | 'in-transit' | 'end'

function getBagStatusMeta(event: BagLidEventPoint): { label: string; tone: BagStatusTone } {
  if (event.deliveryStatus === 'IN_TRANSIT') {
    return { label: 'In Transit', tone: 'in-transit' }
  }

  if (event.deliveryStatus === 'STARTED') {
    return { label: 'Start', tone: 'start' }
  }

  if (event.deliveryStatus === 'COMPLETED') {
    return { label: 'End', tone: 'end' }
  }

  if (event.deliveryPhase === 'Transit') {
    return { label: 'In Transit', tone: 'in-transit' }
  }

  if (event.deliveryPhase === 'Dropoff') {
    return { label: 'End', tone: 'end' }
  }

  return { label: 'Start', tone: 'start' }
}

function BagOpenCloseTimeline({ data }: BagOpenCloseTimelineProps) {
  const openingLogs = useMemo(() => {
    return data
      .filter((event) => event.eventType === 'Open')
      .slice()
      .sort((first, second) => second.epochTime - first.epochTime)
  }, [data])

  return (
    <section className="panel">
      <h2 className="panel-title">Bag Opening Event Logs</h2>
      <p className="panel-subtitle">
        Opening logs with key DB details for operations and incident tracking.
      </p>

      <div className="timeline-log-section">
        <div className="timeline-log-header">
          <h3 className="timeline-log-title">Opening Logs</h3>
          <span className="table-chip">{openingLogs.length} events</span>
        </div>

        {openingLogs.length === 0 ? (
          <div className="empty-state">No bag opening events detected in this time window.</div>
        ) : (
          <div className="table-wrap">
            <table className="alert-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Ride ID</th>
                  <th>Bag Name</th>
                  <th>Route</th>
                  <th>Bag Status</th>
                  <th>Alert</th>
                </tr>
              </thead>
              <tbody>
                {openingLogs.map((event) => {
                  const bagStatus = getBagStatusMeta(event)
                  const routeLabel = event.routeName ?? event.route
                  return (
                    <tr key={event.id}>
                      <td className="cell-time">{new Date(event.timestamp).toLocaleString()}</td>
                      <td>Rider 1</td>
                      <td>
                        <span className="bag-pill">{event.bagName}</span>
                      </td>
                      <td>{routeLabel}</td>
                      <td>
                        <span className={`timeline-status-pill timeline-status-${bagStatus.tone}`}>
                          {bagStatus.label}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`timeline-alert-pill ${
                            event.isUnexpected
                              ? 'timeline-alert-pill-unexpected'
                              : 'timeline-alert-pill-expected'
                          }`}
                        >
                          {event.isUnexpected ? 'Unexpected opening' : 'Expected opening'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

export default BagOpenCloseTimeline
