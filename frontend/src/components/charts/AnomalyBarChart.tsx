import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnomalyBreakdownItem } from '../../types/dashboard'

interface AnomalyBarChartProps {
  data: AnomalyBreakdownItem[]
  selectedHours: number
}

const BAR_COLORS: Record<string, string> = {
  'Temperature Breach': '#DC2626',
  'Excessive Tilt': '#F59E0B',
  'High Humidity': '#2563EB',
  'Leak Detection': '#7C3AED',
  'Offline Sensor': '#334155',
}

function AnomalyBarChart({ data, selectedHours }: AnomalyBarChartProps) {
  const topIncidents = data.slice(0, 5)
  const timeWindowLabel = selectedHours === 1 ? 'Last 1 hour' : `Last ${selectedHours} hours`

  return (
    <section className="panel">
      <h2 className="panel-title">Anomaly Breakdown</h2>
      <p className="panel-subtitle">Incident category counts for selected period ({timeWindowLabel})</p>

      {topIncidents.length === 0 ? (
        <div className="empty-state">No anomaly records in this selection.</div>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={topIncidents}
              layout="vertical"
              margin={{ top: 8, right: 26, left: 12, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke="#d7dfeb" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="type" width={160} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: '10px', borderColor: '#cbd5e1' }} />
              <Legend verticalAlign="top" height={30} />
              <Bar
                dataKey="count"
                name="Incidents"
                radius={[0, 8, 8, 0]}
                barSize={18}
                label={{ position: 'right', fill: '#0f172a', fontSize: 12 }}
              >
                {topIncidents.map((entry, index) => (
                  <Cell
                    key={`${entry.type}-${index}`}
                    fill={BAR_COLORS[entry.type] ?? '#94A3B8'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

export default AnomalyBarChart
