import type { ReactNode } from 'react'

interface MobileContainerProps {
  children: ReactNode
}

function MobileContainer({ children }: MobileContainerProps) {
  return (
    <section className="mobile-view-wrap" aria-label="Mobile View Mode">
      <div className="mobile-phone-frame">
        <div className="mobile-phone-notch" aria-hidden="true" />
        <div className="mobile-phone-screen">{children}</div>
      </div>
    </section>
  )
}

export default MobileContainer
