import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TrendPoint } from '../../types/dashboard'

interface TemperatureHumidityChartProps {
  data: TrendPoint[]
  selectedHours: number
}

interface TemperatureChartPoint extends TrendPoint {
  hotDropMarker: number | null
  coldFluctuationMarker: number | null
  hotDelta: number | null
  coldDelta: number | null
}

const HOT_HOLD_MIN_C = 40
const HOT_HOLD_MAX_C = 75
const COLD_HOLD_MIN_C = 0
const COLD_HOLD_MAX_C = 8
const HOT_DROP_THRESHOLD_C = 4
const COLD_FLUCTUATION_THRESHOLD_C = 2

const getTickStepHours = (hours: number) => {
  if (hours <= 1) return 1 / 6 // 10 minutes
  if (hours <= 6) return 1
  if (hours <= 12) return 1
  if (hours <= 24) return 2
  if (hours <= 48) return 4
  if (hours <= 72) return 6
  return 12
}

function TemperatureHumidityChart({ data, selectedHours }: TemperatureHumidityChartProps) {
  const enrichedData = useMemo<TemperatureChartPoint[]>(() => {
    let previousHot: number | null = null
    let previousCold: number | null = null

    return data.map((point) => {
      const hotDelta = previousHot === null ? null : point.temperatureC - previousHot
      const hotDropMarker =
        hotDelta !== null && hotDelta <= -HOT_DROP_THRESHOLD_C ? point.temperatureC : null

      let coldDelta: number | null = null
      let coldFluctuationMarker: number | null = null

      if (typeof point.coldTemperatureC === 'number') {
        coldDelta = previousCold === null ? null : point.coldTemperatureC - previousCold
        coldFluctuationMarker =
          coldDelta !== null && Math.abs(coldDelta) >= COLD_FLUCTUATION_THRESHOLD_C
            ? point.coldTemperatureC
            : null
        previousCold = point.coldTemperatureC
      }

      previousHot = point.temperatureC

      return {
        ...point,
        hotDropMarker,
        coldFluctuationMarker,
        hotDelta,
        coldDelta,
      }
    })
  }, [data])

  const xDomain = useMemo<[number, number]>(() => {
    if (enrichedData.length === 0) return [0, 1]
    const max = enrichedData[enrichedData.length - 1].epochTime
    const min = max - selectedHours * 60 * 60 * 1000
    return [min, max]
  }, [enrichedData, selectedHours])

  const xTicks = useMemo(() => {
    if (xDomain[0] === 0 && xDomain[1] === 1) return [0, 1]
    const stepMs = getTickStepHours(selectedHours) * 60 * 60 * 1000
    const start = Math.floor(xDomain[0] / stepMs) * stepMs
    const ticks: number[] = []
    for (let tick = start; tick <= xDomain[1]; tick += stepMs) {
      if (tick >= xDomain[0]) ticks.push(tick)
    }
    return ticks.length > 0 ? ticks : [xDomain[0], xDomain[1]]
  }, [selectedHours, xDomain])

  return (
    <section className="panel">
      <h2 className="panel-title">Hot & Cold Temperature Timeline</h2>
      <p className="panel-subtitle">Hot hold (40C-75C), cold hold (0C-8C), and humidity trend</p>

      {enrichedData.length === 0 ? (
        <div className="empty-state">No trend data for the selected filter criteria.</div>
      ) : (
        <div className="temp-dashboard-panel">
          <div className="temp-chart-grid">
            <article className="temp-chart-card">
              <h3 className="temp-chart-title">Hot Temperature + Humidity</h3>
              <div className="chart-wrap temp-chart-wrap">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={enrichedData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#d7dfeb" />
                    <XAxis
                      type="number"
                      dataKey="epochTime"
                      domain={xDomain}
                      ticks={xTicks}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) =>
                        new Date(Number(value)).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      }
                    />
                    <YAxis yAxisId="left" unit="C" tick={{ fontSize: 12 }} domain={[25, 80]} />
                    <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 12 }} domain={[40, 100]} />
                    <ReferenceArea yAxisId="left" y1={HOT_HOLD_MIN_C} y2={HOT_HOLD_MAX_C} fill="#dcfce7" fillOpacity={0.45} />
                    <ReferenceLine yAxisId="left" y={HOT_HOLD_MIN_C} stroke="#0f766e" strokeDasharray="4 4" />
                    <ReferenceLine yAxisId="left" y={HOT_HOLD_MAX_C} stroke="#0f766e" strokeDasharray="4 4" />
                    <Tooltip
                      contentStyle={{ borderRadius: '10px', borderColor: '#cbd5e1' }}
                      cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                    />
                    <Legend verticalAlign="top" height={34} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="temperatureC"
                      name="Hot Temp"
                      stroke="#0ea5e9"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="humidityPct"
                      name="Humidity"
                      stroke="#2563eb"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="hotDropMarker"
                      name="Hot Drop Point"
                      stroke="#dc2626"
                      strokeOpacity={0}
                      dot={{ r: 4, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 }}
                      activeDot={{ r: 5, fill: '#dc2626' }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="temp-chart-card">
              <h3 className="temp-chart-title">Cold Temperature + Humidity</h3>
              <div className="chart-wrap temp-chart-wrap">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={enrichedData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#d7dfeb" />
                    <XAxis
                      type="number"
                      dataKey="epochTime"
                      domain={xDomain}
                      ticks={xTicks}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) =>
                        new Date(Number(value)).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      }
                    />
                    <YAxis yAxisId="left" unit="C" tick={{ fontSize: 12 }} domain={[-5, 15]} />
                    <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 12 }} domain={[40, 100]} />
                    <ReferenceArea yAxisId="left" y1={COLD_HOLD_MIN_C} y2={COLD_HOLD_MAX_C} fill="#dbeafe" fillOpacity={0.5} />
                    <ReferenceLine yAxisId="left" y={COLD_HOLD_MIN_C} stroke="#1d4ed8" strokeDasharray="4 4" />
                    <ReferenceLine yAxisId="left" y={COLD_HOLD_MAX_C} stroke="#1d4ed8" strokeDasharray="4 4" />
                    <Tooltip
                      contentStyle={{ borderRadius: '10px', borderColor: '#cbd5e1' }}
                      cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                    />
                    <Legend verticalAlign="top" height={34} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="coldTemperatureC"
                      name="Cold Temp"
                      stroke="#1d4ed8"
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="humidityPct"
                      name="Humidity"
                      stroke="#2563eb"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="coldFluctuationMarker"
                      name="Cold Fluctuation Point"
                      stroke="#dc2626"
                      strokeOpacity={0}
                      dot={{ r: 4, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 }}
                      activeDot={{ r: 5, fill: '#dc2626' }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  )
}

export default TemperatureHumidityChart
