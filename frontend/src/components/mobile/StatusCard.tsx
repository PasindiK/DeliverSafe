interface StatusCardProps {
  bagId: string
  isClosed: boolean
  deliveryStatus: string
}

function StatusCard({ bagId, isClosed, deliveryStatus }: StatusCardProps) {
  return (
    <article className="mobile-card mobile-status-card">
      <div className="mobile-status-topline">
        <p className="mobile-status-kicker">Smart Delivery Bag</p>
        <span className={`mobile-delivery-pill delivery-${deliveryStatus.toLowerCase().replace(/_/g, '-')}`}>
          {deliveryStatus.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="mobile-status-row">
        <div>
          <p className="mobile-card-label">Bag ID</p>
          <h3 className="mobile-bag-id">{bagId}</h3>
        </div>
      </div>

      <div className={`mobile-bag-state-panel ${isClosed ? 'bag-state-panel-closed' : 'bag-state-panel-open'}`}>
        <span className="mobile-bag-state-icon">{isClosed ? '🔒' : '🔓'}</span>
        <div>
          <p className="mobile-bag-state-caption">Current Lid State</p>
          <p className={`mobile-bag-state ${isClosed ? 'state-normal' : 'state-critical'}`}>
            {isClosed ? 'Closed & Secured' : 'Open'}
          </p>
        </div>
      </div>
    </article>
  )
}

export default StatusCard
