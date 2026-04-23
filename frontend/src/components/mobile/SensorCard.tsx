type SensorTone = 'normal' | 'warning' | 'critical'

interface SensorCardProps {
  icon: string
  label: string
  value: string
  tone: SensorTone
}

function SensorCard({ icon, label, value, tone }: SensorCardProps) {
  return (
    <article className={`mobile-card mobile-sensor-card tone-${tone}`}>
      <div className="mobile-sensor-top">
        <span className="mobile-sensor-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <p className="mobile-card-label">{label}</p>
          <p className="mobile-sensor-subtitle">Live reading</p>
        </div>
      </div>
      <p className="mobile-sensor-value">{value}</p>
    </article>
  )
}

export default SensorCard
