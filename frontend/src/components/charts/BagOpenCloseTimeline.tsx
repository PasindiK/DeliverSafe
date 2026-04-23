import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BagLidEventPoint } from '../../types/dashboard'

interface BagOpenCloseTimelineProps {
  data: BagLidEventPoint[]
}

interface BagEventTooltipProps {
  active?: boolean
  payload?: Array<{ payload: BagLidEventPoint }>
}

function BagEventTooltip({ active, payload }: BagEventTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const event = payload[0].payload
  const icon = event.eventType === 'Open' ? '🔓' : '🔒'
  const contextLabel = event.isUnexpected ? 'Unexpected in-transit opening' : 'Expected handling event'

  return (
    <div className="timeline-tooltip">
      <p className="timeline-tooltip-title">
        {icon} Bag {event.eventType}
      </p>
      <p>
        <strong>Bag:</strong> {event.bagId}
      </p>
      <p>
        <strong>Route:</strong> {event.route}
      </p>
      <p>
        <strong>Phase:</strong> {event.deliveryPhase}
      </p>
      <p>
        <strong>Time:</strong> {new Date(event.timestamp).toLocaleString()}
      </p>
      <p>
        <strong>Context:</strong> {contextLabel}
      </p>
    </div>
  )
}

function BagOpenCloseTimeline({ data }: BagOpenCloseTimelineProps) {
  const bagLabelMap = useMemo(() => {
    return new Map(data.map((event) => [event.bagOrder, event.bagId]))
  }, [data])

  const highestBagOrder = useMemo(() => {
    return data.reduce((highest, event) => Math.max(highest, event.bagOrder), 1)
  }, [data])

  const { expectedOpenEvents, unexpectedOpenEvents, closeEvents } = useMemo(() => {
    const openEvents = data.filter((event) => event.eventType === 'Open')

    return {
      expectedOpenEvents: openEvents.filter((event) => !event.isUnexpected),
      unexpectedOpenEvents: openEvents.filter((event) => event.isUnexpected),
      closeEvents: data.filter((event) => event.eventType === 'Close'),
    }
  }, [data])

  const xDomain = useMemo(() => {
    if (data.length === 0) {
      return [0, 1]
    }

    const min = data[0].epochTime
    const max = data[data.length - 1].epochTime

    if (min === max) {
      const padding = 30 * 60 * 1000
      return [min - padding, max + padding]
    }

    return [min, max]
  }, [data])

  return (
    <section className="panel">
      <h2 className="panel-title">Bag Open / Close Event Timeline</h2>
      <p className="panel-subtitle">
        Tracks expected handling actions and highlights abnormal in-transit opening events.
      </p>

      {data.length === 0 ? (
        <div className="empty-state">No open or close state changes detected.</div>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 12, right: 10, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#d7dfeb" />
              <XAxis
                type="number"
                dataKey="epochTime"
                domain={xDomain}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  new Date(Number(value)).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }
              />
              <YAxis
                type="number"
                dataKey="bagOrder"
                domain={[0, highestBagOrder + 1]}
                tickCount={highestBagOrder + 1}
                allowDecimals={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => bagLabelMap.get(Number(value)) ?? ''}
              />
              <Tooltip content={<BagEventTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <Legend verticalAlign="top" height={30} />
              <Scatter
                name="🔓 Expected open"
                data={expectedOpenEvents}
                fill="#16A34A"
                shape="circle"
              />
              <Scatter
                name="⚠️ Unexpected transit open"
                data={unexpectedOpenEvents}
                fill="#DC2626"
                shape="diamond"
              />
              <Scatter name="🔒 Close event" data={closeEvents} fill="#2563EB" shape="triangle" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

export default BagOpenCloseTimeline
