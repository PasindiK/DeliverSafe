import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  {
    to: '/overview',
    label: 'Overview',
    hint: 'Operations snapshot',
  },
  {
    to: '/alerts',
    label: 'Alerts & Incidents',
    hint: 'Triage and response',
  },
]

function PageTabs() {
  return (
    <nav className="page-tabs" aria-label="Dashboard pages">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? 'page-tab page-tab-active' : 'page-tab')}
        >
          <span className="page-tab-label">{item.label}</span>
          <span className="page-tab-hint">{item.hint}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default PageTabs
