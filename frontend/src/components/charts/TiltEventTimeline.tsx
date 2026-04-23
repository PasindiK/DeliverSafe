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
import type { TiltEventPoint } from '../../types/dashboard'

interface TiltEventTimelineProps {
  data: TiltEventPoint[]
}

interface TiltTooltipProps {
  active?: boolean
  payload?: Array<{ payload: TiltEventPoint }>
}

function TiltTooltip({ active, payload }: TiltTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const event = payload[0].payload
  const rainfallLabel = event.rainfallMm > 0 ? `${event.rainfallMm.toFixed(1)} mm` : 'No rain'

  return (
    <div className="timeline-tooltip">
      <p className="timeline-tooltip-title">{event.severity} Tilt Event</p>
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
        <strong>Tilt:</strong> {event.tiltDeg.toFixed(1)}°
      </p>
      <p>
        <strong>Rainfall:</strong> {rainfallLabel}
      </p>
    </div>
  )
}

function TiltEventTimeline({ data }: TiltEventTimelineProps) {
  const bagLabelMap = useMemo(() => {
    return new Map(data.map((event) => [event.bagOrder, event.bagId]))
  }, [data])

  const highestBagOrder = useMemo(() => {
    return data.reduce((highest, event) => Math.max(highest, event.bagOrder), 1)
  }, [data])

  const { moderateEvents, criticalEvents } = useMemo(() => {
    return {
      moderateEvents: data.filter((event) => event.severity === 'Moderate'),
      criticalEvents: data.filter((event) => event.severity === 'Critical'),
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
      <h2 className="panel-title">Tilt Event Timeline</h2>
      <p className="panel-subtitle">
        Detects rough handling patterns by severity across delivery sessions.
      </p>

      {data.length === 0 ? (
        <div className="empty-state">No tilt events detected in the selected time range.</div>
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
              <Tooltip content={<TiltTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <Legend verticalAlign="top" height={30} />
              <Scatter
                name="Moderate tilt (20°–29.9°)"
                data={moderateEvents}
                fill="#F59E0B"
                line={false}
                shape="circle"
              />
              <Scatter
                name="Critical tilt (≥30°)"
                data={criticalEvents}
                fill="#DC2626"
                line={false}
                shape="diamond"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

export default TiltEventTimeline
