import type { DashboardFilters as DashboardFiltersType } from '../../types/dashboard'

interface DashboardFiltersProps {
  filters: DashboardFiltersType
  bagOptions: string[]
  routeOptions: string[]
  onChange: (nextFilters: DashboardFiltersType) => void
}

function DashboardFilters({
  filters,
  bagOptions,
  routeOptions,
  onChange,
}: DashboardFiltersProps) {
  const updateFilter = <K extends keyof DashboardFiltersType>(
    key: K,
    value: DashboardFiltersType[K],
  ) => {
    onChange({
      ...filters,
      [key]: value,
    })
  }

  return (
    <section className="panel filters-bar" aria-label="Global filters">
      <div className="filters-row">
        <label className="filter-item">
          <span>Bag ID</span>
          <select value={filters.bagId} onChange={(event) => updateFilter('bagId', event.target.value)}>
            <option value="ALL">All Bags</option>
            {bagOptions.map((bagId) => (
              <option key={bagId} value={bagId}>
                {bagId}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-item">
          <span>Route</span>
          <select value={filters.route} onChange={(event) => updateFilter('route', event.target.value)}>
            <option value="ALL">All Routes</option>
            {routeOptions.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-item">
          <span>Time Range</span>
          <select
            value={filters.hours}
            onChange={(event) => updateFilter('hours', Number(event.target.value))}
          >
            <option value={1}>Last 1 hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={12}>Last 12 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={48}>Last 48 hours</option>
            <option value={72}>Last 72 hours</option>
          </select>
        </label>

        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={filters.anomaliesOnly}
            onChange={(event) => updateFilter('anomaliesOnly', event.target.checked)}
          />
          <span>Show anomalies only</span>
        </label>
      </div>
    </section>
  )
}

export default DashboardFilters
