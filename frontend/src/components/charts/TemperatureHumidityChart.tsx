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
}

function TemperatureHumidityChart({ data }: TemperatureHumidityChartProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">Hot & Cold Temperature Timeline</h2>
      <p className="panel-subtitle">Hot hold (40°C–75°C), cold hold (0°C–8°C), and humidity trend</p>

      {data.length === 0 ? (
        <div className="empty-state">No trend data for the selected filter criteria.</div>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#d7dfeb" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} minTickGap={24} />
              <YAxis
                yAxisId="left"
                unit="°C"
                tick={{ fontSize: 12 }}
                domain={[-5, 80]}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                unit="%"
                tick={{ fontSize: 12 }}
                domain={[40, 100]}
              />
              <ReferenceArea yAxisId="left" y1={0} y2={8} fill="#dbeafe" fillOpacity={0.55} />
              <ReferenceArea yAxisId="left" y1={40} y2={60} fill="#ffedd5" fillOpacity={0.6} />
              <ReferenceArea yAxisId="left" y1={60} y2={75} fill="#dcfce7" fillOpacity={0.5} />
              <ReferenceLine yAxisId="left" y={0} stroke="#1d4ed8" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="left" y={8} stroke="#1d4ed8" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="left" y={40} stroke="#ea580c" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="left" y={60} stroke="#0f766e" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="left" y={75} stroke="#0f766e" strokeDasharray="4 4" />
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
                yAxisId="left"
                type="monotone"
                dataKey="coldTemperatureC"
                name="Cold Temp"
                stroke="#1d4ed8"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="humidityPct"
                name="Humidity"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

export default TemperatureHumidityChart
