import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SensorRecord } from '../../types/dashboard'
import type { TiltKpiMetrics } from '../../services/dashboardService'

interface TiltEventTimelineProps {
  data: SensorRecord[]
  selectedHours: number
  kpiMetrics?: TiltKpiMetrics
}

interface TiltAlertPoint {
  epochTime: number
  timestamp: string
  bagId: string
  tiltDeg: number
  severity: 'Warning' | 'Unsafe'
  routeName: string
  riderName: string
  riderStartTime: string
  riderEndTime: string
}

interface TiltTooltipProps {
  active?: boolean
  payload?: Array<{ payload: TiltAlertPoint }>
}

const WARNING_THRESHOLD = 20
const UNSAFE_THRESHOLD = 30

const getTickStepHours = (hours: number) => {
  if (hours <= 1) return 1 / 6 // 10 minutes
  if (hours <= 6) return 1
  if (hours <= 12) return 1
  if (hours <= 24) return 2
  if (hours <= 48) return 4
  if (hours <= 72) return 6
  return 12
}

function TiltTooltip({ active, payload }: TiltTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const point = payload[0].payload

  return (
    <div className="timeline-tooltip">
      <p className="timeline-tooltip-title">{point.severity} Tilt Alert</p>
      <p>
        <strong>Bag ID:</strong> {point.bagId}
      </p>
      <p>
        <strong>Tilt Angle:</strong> {point.tiltDeg.toFixed(1)}°
      </p>
      <p>
        <strong>Time:</strong> {new Date(point.timestamp).toLocaleString()}
      </p>
      <p>
        <strong>Route:</strong> {point.routeName}
      </p>
      <p>
        <strong>Rider Start Time:</strong> {point.riderStartTime}
      </p>
      <p>
        <strong>Rider End Time:</strong> {point.riderEndTime}
      </p>
      <p>
        <strong>Rider:</strong> {point.riderName}
      </p>
    </div>
  )
}

function TiltEventTimeline({ data, selectedHours, kpiMetrics }: TiltEventTimelineProps) {
  const sortedRecords = useMemo(() => {
    return data
      .filter((record) => !Number.isNaN(new Date(record.timestamp).getTime()))
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [data])

  const alertPoints = useMemo<TiltAlertPoint[]>(() => {
    return sortedRecords
      .filter((record) => record.tiltDetected || record.tiltDeg >= WARNING_THRESHOLD)
      .map((record) => ({
        epochTime: new Date(record.timestamp).getTime(),
        timestamp: record.timestamp,
        bagId: record.bagId,
        tiltDeg: record.tiltDeg,
        severity: record.tiltDetected || record.tiltDeg >= UNSAFE_THRESHOLD ? 'Unsafe' : 'Warning',
        routeName: record.routeName || record.route || 'Unknown Route',
        riderName: record.riderName || 'Unknown',
        riderStartTime: record.deliveryStartTime ? new Date(record.deliveryStartTime).toLocaleString() : 'Unknown',
        riderEndTime: record.deliveryEndTime ? new Date(record.deliveryEndTime).toLocaleString() : 'In Progress',
      }))
  }, [sortedRecords])

  const timeDomain = useMemo<[number, number]>(() => {
    if (sortedRecords.length === 0) return [0, 1]
    const end = new Date(sortedRecords[sortedRecords.length - 1].timestamp).getTime()
    const start = end - selectedHours * 60 * 60 * 1000
    return [start, end]
  }, [selectedHours, sortedRecords])

  const ticks = useMemo(() => {
    if (timeDomain[0] === 0 && timeDomain[1] === 1) return [0, 1]
    const stepHours = getTickStepHours(selectedHours)
    const stepMs = stepHours * 60 * 60 * 1000
    const start = Math.floor(timeDomain[0] / stepMs) * stepMs
    const result: number[] = []
    for (let tick = start; tick <= timeDomain[1]; tick += stepMs) {
      if (tick >= timeDomain[0]) {
        result.push(tick)
      }
    }
    if (result.length === 0) {
      result.push(timeDomain[0], timeDomain[1])
    }
    return result
  }, [selectedHours, timeDomain])

  const warningCount = alertPoints.filter((point) => point.severity === 'Warning').length
  const unsafeCount = alertPoints.filter((point) => point.severity === 'Unsafe').length

    // Use provided KPI metrics or calculate from current alert points
    const displayMetrics = kpiMetrics || {
      safePercentage: alertPoints.length > 0 ? ((data.length - alertPoints.length) / data.length) * 100 : 0,
      warningPercentage: alertPoints.length > 0 ? (warningCount / data.length) * 100 : 0,
      unsafePercentage: alertPoints.length > 0 ? (unsafeCount / data.length) * 100 : 0,
      alertCount: alertPoints.length,
      totalRecords: data.length,
    }

    return (
    <section className="panel tilt-dashboard-panel">
      <h2 className="panel-title">Tilt Event Timeline</h2>
      <p className="panel-subtitle">
        Detects rough handling patterns by severity across delivery sessions.
      </p>

        <div className="tilt-kpi-container">
          <div className="tilt-kpi-box tilt-kpi-safe">
            <span className="tilt-kpi-emoji">🟢</span>
            <div className="tilt-kpi-content">
              <p className="tilt-kpi-label">Safe %</p>
              <p className="tilt-kpi-value">{displayMetrics.safePercentage.toFixed(0)}%</p>
            </div>
          </div>

          <div className="tilt-kpi-box tilt-kpi-warning">
            <span className="tilt-kpi-emoji">🟡</span>
            <div className="tilt-kpi-content">
              <p className="tilt-kpi-label">Warning %</p>
              <p className="tilt-kpi-value">{displayMetrics.warningPercentage.toFixed(0)}%</p>
            </div>
          </div>

          <div className="tilt-kpi-box tilt-kpi-unsafe">
            <span className="tilt-kpi-emoji">🔴</span>
            <div className="tilt-kpi-content">
              <p className="tilt-kpi-label">Unsafe %</p>
              <p className="tilt-kpi-value">{displayMetrics.unsafePercentage.toFixed(0)}%</p>
            </div>
          </div>

          <div className="tilt-kpi-box tilt-kpi-alerts">
            <span className="tilt-kpi-emoji">⚠️</span>
            <div className="tilt-kpi-content">
              <p className="tilt-kpi-label">Alerts</p>
              <p className="tilt-kpi-value">{displayMetrics.alertCount} events</p>
            </div>
          </div>
        </div>

      {alertPoints.length === 0 ? (
        <div className="empty-state">No warning/unsafe tilt alerts in the selected time range.</div>
      ) : (
        <div className="chart-wrap tilt-line-wrap">
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={alertPoints} margin={{ top: 10, right: 10, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#d7dfeb" />
              <XAxis
                type="number"
                dataKey="epochTime"
                domain={timeDomain}
                ticks={ticks}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  new Date(Number(value)).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }
              />
              <YAxis
                domain={[WARNING_THRESHOLD, Math.max(45, Math.ceil(Math.max(...alertPoints.map((point) => point.tiltDeg)) / 5) * 5 + 5)]}
                tick={{ fontSize: 12 }}
                unit="°"
              />
              <Tooltip content={<TiltTooltip />} />
              <Line
                type="monotone"
                dataKey="tiltDeg"
                stroke="#94a3b8"
                strokeWidth={1.5}
                dot={({ cx, cy, payload }) => {
                  if (cx === undefined || cy === undefined || !payload) return null
                  const pointColor = payload.severity === 'Unsafe' ? '#dc2626' : '#f59e0b'
                  return <circle cx={cx} cy={cy} r={4} fill={pointColor} stroke="#ffffff" strokeWidth={1} />
                }}
                activeDot={({ cx, cy, payload }) => {
                  if (cx === undefined || cy === undefined || !payload) return null
                  const pointColor = payload.severity === 'Unsafe' ? '#dc2626' : '#f59e0b'
                  return <circle cx={cx} cy={cy} r={6} fill={pointColor} stroke="#ffffff" strokeWidth={1.5} />
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

export default TiltEventTimeline
