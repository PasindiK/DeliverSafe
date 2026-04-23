type AlertTone = 'warning' | 'critical'

interface AlertPopupProps {
  message: string
  tone: AlertTone
  onCancel: () => void
  onConfirm: () => void
}

const getAlertDetails = (message: string, tone: AlertTone) => {
  if (message.includes('Water Leak')) {
    return {
      title: 'Water Leak Detected',
      description: 'Liquid is detected inside the bag. Stop movement and inspect the contents immediately.',
      icon: '💧',
    }
  }

  if (message.includes('Hot Compartment Leak')) {
    return {
      title: 'Hot Compartment Leak',
      description: 'Leak detected in the hot compartment. Check the hot-food section immediately.',
      icon: '🚿',
    }
  }

  if (message.includes('Cold Compartment Leak')) {
    return {
      title: 'Cold Compartment Leak',
      description: 'Leak detected in the cold compartment. Check seals and cold items immediately.',
      icon: '❄️',
    }
  }

  if (message.includes('Bag Opened')) {
    return {
      title: 'Bag Opened',
      description: 'The lid is open. Verify the contents and secure the bag before continuing delivery.',
      icon: '🔓',
    }
  }

  if (message.includes('Excessive Tilt')) {
    return {
      title: 'Excessive Tilt',
      description: 'The bag angle is outside the safe range. Reposition it to avoid spills or damage.',
      icon: '📐',
    }
  }

  if (message.includes('Temperature Alert')) {
    return {
      title: 'Temperature Warning',
      description: 'The bag temperature is outside the target range. Check insulation and food safety status.',
      icon: '🌡️',
    }
  }

  if (message.includes('Cold Temperature Alert')) {
    return {
      title: 'Cold Compartment Alert',
      description: 'The cold section temperature is out of safe range. Check cooling and compartment seal.',
      icon: '🧊',
    }
  }

  return {
    title: tone === 'critical' ? 'Critical Alert' : 'Warning Alert',
    description: 'A bag event needs attention. Review the latest sensor state before proceeding.',
    icon: tone === 'critical' ? '🚨' : '⚠️',
  }
}

function AlertPopup({ message, tone, onCancel, onConfirm }: AlertPopupProps) {
  const details = getAlertDetails(message, tone)

  return (
    <div className="mobile-alert-modal-backdrop" role="presentation">
      <div className={`mobile-alert-modal tone-${tone}`} role="alertdialog" aria-modal="true">
        <div className="mobile-alert-pill">{tone === 'critical' ? 'Critical alert' : 'Warning alert'}</div>
        <div className="mobile-alert-icon">{details.icon}</div>
        <h3 className="mobile-alert-title">{details.title}</h3>
        <p className="mobile-alert-message">{message}</p>
        <p className="mobile-alert-description">{details.description}</p>
        <div className="mobile-alert-actions">
          <button type="button" className="mobile-alert-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="mobile-alert-ok" onClick={onConfirm}>
            Stop & Check
          </button>
        </div>
      </div>
    </div>
  )
}

export default AlertPopup
