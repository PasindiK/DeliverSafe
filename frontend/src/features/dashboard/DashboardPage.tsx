import { useEffect, useMemo, useRef, useState } from 'react'
import KpiCard from '../../components/cards/KpiCard'
import LeakDetectionStatusCard from '../../components/cards/LeakDetectionStatusCard'
import AnomalyBarChart from '../../components/charts/AnomalyBarChart'
import BagOpenCloseTimeline from '../../components/charts/BagOpenCloseTimeline'
import TemperatureHumidityChart from '../../components/charts/TemperatureHumidityChart'
import TiltEventTimeline from '../../components/charts/TiltEventTimeline'
import DashboardFilters from '../../components/filters/DashboardFilters'
import AlertPopup from '../../components/mobile/AlertPopup'
import MobileContainer from '../../components/mobile/MobileContainer'
import MobileMapCard from '../../components/mobile/MobileMapCard'
import SensorCard from '../../components/mobile/SensorCard'
import StatusCard from '../../components/mobile/StatusCard'
import PageTabs from '../../components/navigation/PageTabs'
import { fetchRiders, fetchRoutes } from '../../services/apiService'
import {
  buildAnomalyBreakdown,
  buildBagLidEventPoints,
  buildKpiMetrics,
  buildLeakStatusSummary,
  buildLeakTrendData,
  buildTiltEventPoints,
  buildTrendData,
  defaultDashboardFilters,
  filterRecords,
} from '../../services/dashboardService'
import type { RiderOption, RouteOption, SensorRecord } from '../../types/dashboard'

interface DashboardPageProps {
  records: SensorRecord[]
  availableBagIds?: string[]
}

interface MobileAlert {
  id: number
  tone: 'warning' | 'critical'
  message: string
}

interface MobileTrackedState {
  hotLeakDetected: boolean
  coldLeakDetected: boolean
  bagOpen: boolean
  excessiveTilt: boolean
  temperatureAbnormal: boolean
  coldTemperatureAbnormal: boolean
}

interface MobileLocation {
  latitude: number
  longitude: number
  accuracy?: number
  isReal: boolean
}

type DeliveryStatus = 'IDLE' | 'IN_TRANSIT' | 'COMPLETED'

const MOBILE_BAG_ID = 'ESP32_BAG_01'
const CHAT_CHART_CONTEXT_STORAGE_KEY = 'deliver_safe_chart_context_v1'
const TILT_ALERT_THRESHOLD = 25
const SENSOR_TEMP_WARNING_C = 40
const SENSOR_TEMP_CRITICAL_C = 75
const COLD_TEMP_MIN_C = 0
const COLD_TEMP_MAX_C = 8
const SENSOR_HUMIDITY_WARNING_PCT = 80
const SENSOR_HUMIDITY_CRITICAL_PCT = 90
const LEAK_POPUP_REPEAT_MS = 8000
const ALERT_AUTO_DISMISS_MS = 5000

const BASE_LOCATION = {
  latitude: 6.9271,
  longitude: 79.8612,
}

function DashboardPage({ records, availableBagIds = [] }: DashboardPageProps) {
  const [filters, setFilters] = useState(defaultDashboardFilters)
  const [isMobileView, setIsMobileView] = useState(false)
  const [mobileAlerts, setMobileAlerts] = useState<MobileAlert[]>([])
  const [activeAlert, setActiveAlert] = useState<MobileAlert | null>(null)
  const [mobileLocation, setMobileLocation] = useState<MobileLocation>({
    latitude: BASE_LOCATION.latitude,
    longitude: BASE_LOCATION.longitude,
    isReal: false,
  })
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>('IDLE')
  const [deliveryId, setDeliveryId] = useState<string | null>(null)
  const [deliveryStartTime, setDeliveryStartTime] = useState<string | null>(null)
  const [deliveryRiders, setDeliveryRiders] = useState<RiderOption[]>([])
  const [deliveryRoutes, setDeliveryRoutes] = useState<RouteOption[]>([])
  const [selectedRiderId, setSelectedRiderId] = useState('')
  const [selectedRouteId, setSelectedRouteId] = useState('')
  const [activeRiderName, setActiveRiderName] = useState<string | null>(null)
  const [activeRouteName, setActiveRouteName] = useState<string | null>(null)
  const [activeRouteStartLocation, setActiveRouteStartLocation] = useState<string | null>(null)
  const [activeRouteEndLocation, setActiveRouteEndLocation] = useState<string | null>(null)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [deliveryActionPending, setDeliveryActionPending] = useState<'start' | 'end' | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const latestStateRef = useRef<MobileTrackedState | null>(null)
  const lastHotLeakAlertAtRef = useRef(0)
  const lastColdLeakAlertAtRef = useRef(0)
  const geoWatchRef = useRef<number | null>(null)
  const deliveryActionPendingRef = useRef(false)

  // ── Delivery API helpers ──────────────────────────────────────────────────
  const syncDeliveryStatus = async () => {
    if (deliveryActionPendingRef.current) {
      return
    }

    try {
      const res = await fetch(`/api/delivery/status?bagId=${encodeURIComponent(MOBILE_BAG_ID)}`)
      if (!res.ok) return
      const data = await res.json()
      setDeliveryStatus(data.status as DeliveryStatus)
      setDeliveryId(data.deliveryId ?? null)
      setDeliveryStartTime(data.startTime ?? null)
      if (data.status === 'IN_TRANSIT') {
        setSelectedRiderId(data.riderId ?? '')
        setSelectedRouteId(data.routeId ?? '')
        setActiveRiderName(data.riderName ?? null)
        setActiveRouteName(data.routeName ?? null)
        setActiveRouteStartLocation(data.routeStartLocation ?? null)
        setActiveRouteEndLocation(data.routeEndLocation ?? null)
      } else {
        setActiveRiderName(null)
        setActiveRouteName(null)
        setActiveRouteStartLocation(null)
        setActiveRouteEndLocation(null)
        setElapsedSeconds(0)
      }
    } catch {
      // network unavailable – keep current state
    }
  }

  const selectedRider = useMemo(
    () => deliveryRiders.find((rider) => rider.id === selectedRiderId) ?? null,
    [deliveryRiders, selectedRiderId],
  )

  const selectedRoute = useMemo(
    () => deliveryRoutes.find((route) => route.id === selectedRouteId) ?? null,
    [deliveryRoutes, selectedRouteId],
  )

  const startDelivery = async () => {
    if (!selectedRiderId || !selectedRouteId) {
      setDeliveryError('Please select both rider and route before starting the delivery.')
      return
    }

    setDeliveryError(null)
    setDeliveryActionPending('start')
    deliveryActionPendingRef.current = true
    const startedAt = new Date().toISOString()
    setDeliveryStatus('IN_TRANSIT')
    setDeliveryId(null)
    setDeliveryStartTime(startedAt)
    setElapsedSeconds(0)
    setActiveRiderName(selectedRider?.name ?? null)
    setActiveRouteName(selectedRoute?.name ?? null)
    setActiveRouteStartLocation(selectedRoute?.startLocation ?? null)
    setActiveRouteEndLocation(selectedRoute?.endLocation ?? null)

    try {
      const res = await fetch('/api/delivery/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bagId: MOBILE_BAG_ID, riderId: selectedRiderId, routeId: selectedRouteId }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to start delivery')
      }

      if (res.ok) {
        const data = await res.json()
        setDeliveryId(data.deliveryId ?? null)
        setDeliveryStartTime(data.startTime)
        setDeliveryStatus('IN_TRANSIT')
        setElapsedSeconds(0)
        setActiveRiderName(data.riderName ?? selectedRider?.name ?? null)
        setActiveRouteName(data.routeName ?? selectedRoute?.name ?? null)
        setActiveRouteStartLocation(data.routeStartLocation ?? selectedRoute?.startLocation ?? null)
        setActiveRouteEndLocation(data.routeEndLocation ?? selectedRoute?.endLocation ?? null)
      }
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : 'Failed to start delivery')
      setDeliveryStatus('IDLE')
      setDeliveryId(null)
      setDeliveryStartTime(null)
      setActiveRiderName(null)
      setActiveRouteName(null)
      setActiveRouteStartLocation(null)
      setActiveRouteEndLocation(null)
      setElapsedSeconds(0)
      syncDeliveryStatus()
    } finally {
      setDeliveryActionPending(null)
      deliveryActionPendingRef.current = false
    }
  }

  const endDelivery = async () => {
    setDeliveryActionPending('end')
    deliveryActionPendingRef.current = true
    try {
      const res = await fetch('/api/delivery/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bagId: MOBILE_BAG_ID }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to end delivery')
      }
      // On success, fully reset all delivery state so user can start a new delivery
      setDeliveryStatus('IDLE')
      setDeliveryId(null)
      setDeliveryStartTime(null)
      setSelectedRiderId('')
      setSelectedRouteId('')
      setActiveRiderName(null)
      setActiveRouteName(null)
      setActiveRouteStartLocation(null)
      setActiveRouteEndLocation(null)
      setDeliveryError(null)
      setElapsedSeconds(0)
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : 'Failed to end delivery')
      syncDeliveryStatus()
    } finally {
      setDeliveryActionPending(null)
      deliveryActionPendingRef.current = false
    }
  }

  const bagOptions = useMemo(() => {
    return Array.from(new Set([...availableBagIds, ...records.map((record) => record.bagId)]))
  }, [availableBagIds, records])

  const routeOptions = useMemo(() => {
    return Array.from(new Set(records.map((record) => record.route)))
  }, [records])

  const filteredRecords = useMemo(() => {
    return filterRecords(records, filters)
  }, [records, filters])

  const kpis = useMemo(() => {
    return buildKpiMetrics(filteredRecords)
  }, [filteredRecords])

  const trendData = useMemo(() => {
    return buildTrendData(filteredRecords)
  }, [filteredRecords])

  const anomalyData = useMemo(() => {
    return buildAnomalyBreakdown(filteredRecords)
  }, [filteredRecords])

  const tiltEvents = useMemo(() => {
    return buildTiltEventPoints(filteredRecords)
  }, [filteredRecords])

  const bagLidEvents = useMemo(() => {
    return buildBagLidEventPoints(filteredRecords)
  }, [filteredRecords])

  const leakStatus = useMemo(() => {
    return buildLeakStatusSummary(filteredRecords)
  }, [filteredRecords])

  const leakTrendData = useMemo(() => {
    return buildLeakTrendData(filteredRecords)
  }, [filteredRecords])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const chartContext = {
      generatedAt: new Date().toISOString(),
      filters: {
        bagId: filters.bagId,
        route: filters.route,
        hours: filters.hours,
        anomaliesOnly: filters.anomaliesOnly,
      },
      chartData: {
        tiltEventTimeline: tiltEvents.slice(-200).map((event) => ({
          timestamp: event.timestamp,
          bagId: event.bagId,
          route: event.route,
          deliveryPhase: event.deliveryPhase,
          tiltDeg: event.tiltDeg,
          severity: event.severity,
          rainfallMm: event.rainfallMm,
        })),
        anomalyBreakdown: anomalyData,
        temperatureHumidityTrend: trendData.slice(-200),
        bagOpenCloseTimeline: bagLidEvents.slice(-200).map((event) => ({
          timestamp: event.timestamp,
          bagId: event.bagId,
          route: event.route,
          deliveryPhase: event.deliveryPhase,
          eventType: event.eventType,
          isUnexpected: event.isUnexpected,
        })),
        leakTrend: leakTrendData.slice(-200),
      },
      kpis,
    }

    try {
      window.localStorage.setItem(CHAT_CHART_CONTEXT_STORAGE_KEY, JSON.stringify(chartContext))
    } catch {
      // Ignore localStorage quota/privacy failures.
    }
  }, [filters, tiltEvents, anomalyData, trendData, bagLidEvents, leakTrendData, kpis])

  const latestRecord = useMemo(() => {
    if (records.length === 0) {
      return null
    }

    // Ignore marker rows (DELIVERY_START / DELIVERY_END) for live cards and alerts.
    // Live UI should always reflect the newest SENSOR payload.
    const latestSensor = [...records]
      .reverse()
      .find((record) => (record.eventType ?? 'SENSOR') === 'SENSOR')

    return latestSensor ?? records[records.length - 1]
  }, [records])

  const enqueueMobileAlert = (tone: 'warning' | 'critical', message: string) => {
    const alertId = Date.now() + Math.floor(Math.random() * 1000)

    setMobileAlerts((currentAlerts) => [...currentAlerts, { id: alertId, tone, message }])
  }

  useEffect(() => {
    if (activeAlert || mobileAlerts.length === 0) {
      return
    }

    const nextAlert = mobileAlerts[0]
    setActiveAlert(nextAlert)

    if (nextAlert.tone === 'critical') {
      try {
        const audioContext = new window.AudioContext()
        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()

        oscillator.type = 'square'
        oscillator.frequency.value = 980
        gain.gain.value = 0.05

        oscillator.connect(gain)
        gain.connect(audioContext.destination)

        oscillator.start()
        oscillator.stop(audioContext.currentTime + 0.12)
      } catch {
        // no-op: audio can fail if browser blocks autoplay
      }
    }

    if (navigator.vibrate) {
      navigator.vibrate(nextAlert.tone === 'critical' ? [120, 60, 120] : [80])
    }
  }, [activeAlert, mobileAlerts])

  useEffect(() => {
    if (!activeAlert) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setMobileAlerts((currentAlerts) => currentAlerts.filter((alert) => alert.id !== activeAlert.id))
      setActiveAlert(null)
    }, ALERT_AUTO_DISMISS_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeAlert])

  useEffect(() => {
    if (!latestRecord) {
      return
    }

    const currentState: MobileTrackedState = {
      hotLeakDetected: latestRecord.hotLeakDetected,
      coldLeakDetected: latestRecord.coldLeakDetected,
      bagOpen: latestRecord.lidOpen,
      // Use the ESP32's own flag OR the frontend degree threshold — whichever fires first
      excessiveTilt: latestRecord.tiltDeg > TILT_ALERT_THRESHOLD || latestRecord.tiltDetected,
      temperatureAbnormal:
        latestRecord.temperatureC < SENSOR_TEMP_WARNING_C || latestRecord.temperatureC > SENSOR_TEMP_CRITICAL_C,
      coldTemperatureAbnormal:
        latestRecord.coldTemperatureC !== undefined &&
        (latestRecord.coldTemperatureC < COLD_TEMP_MIN_C || latestRecord.coldTemperatureC > COLD_TEMP_MAX_C),
    }

    const previousState = latestStateRef.current
    // Fire on every false→true transition regardless of delivery status
    const now = Date.now()

    if (currentState.hotLeakDetected) {
      const shouldAlertHot =
        !previousState?.hotLeakDetected || now - lastHotLeakAlertAtRef.current >= LEAK_POPUP_REPEAT_MS
      if (shouldAlertHot) {
        enqueueMobileAlert('critical', '\uD83D\uDEA8 Hot Compartment Leak Detected')
        lastHotLeakAlertAtRef.current = now
      }
    }

    if (currentState.coldLeakDetected) {
      const shouldAlertCold =
        !previousState?.coldLeakDetected || now - lastColdLeakAlertAtRef.current >= LEAK_POPUP_REPEAT_MS
      if (shouldAlertCold) {
        enqueueMobileAlert('critical', '❄️ Cold Compartment Leak Detected')
        lastColdLeakAlertAtRef.current = now
      }
    }

    if (previousState) {
      if (!previousState.bagOpen && currentState.bagOpen) {
        enqueueMobileAlert('warning', '\u26A0\uFE0F Bag Opened')
      }

      if (!previousState.excessiveTilt && currentState.excessiveTilt) {
        enqueueMobileAlert('warning', '\u26A0\uFE0F Excessive Tilt')
      }

      if (!previousState.temperatureAbnormal && currentState.temperatureAbnormal) {
        enqueueMobileAlert('critical', '\uD83D\uDD25 Temperature Alert')
      }

      if (!previousState.coldTemperatureAbnormal && currentState.coldTemperatureAbnormal) {
        enqueueMobileAlert('critical', '🧊 Cold Temperature Alert')
      }
    }

    latestStateRef.current = currentState
  }, [latestRecord, deliveryStatus])

  const mobileTemperatureTone = useMemo(() => {
    if (!latestRecord) return 'normal'
    if (latestRecord.temperatureC > SENSOR_TEMP_CRITICAL_C || latestRecord.temperatureC < SENSOR_TEMP_WARNING_C) {
      return 'critical'
    }
    if (latestRecord.temperatureC < 50 || latestRecord.temperatureC > 70) {
      return 'warning'
    }
    return 'normal'
  }, [latestRecord])

  const mobileHumidityTone = useMemo(() => {
    if (!latestRecord) return 'normal'
    if (latestRecord.humidityPct >= SENSOR_HUMIDITY_CRITICAL_PCT) return 'critical'
    if (latestRecord.humidityPct >= SENSOR_HUMIDITY_WARNING_PCT) return 'warning'
    return 'normal'
  }, [latestRecord])

  const mobileColdTemperatureTone = useMemo(() => {
    if (!latestRecord || latestRecord.coldTemperatureC === undefined) return 'normal'
    if (latestRecord.coldTemperatureC < COLD_TEMP_MIN_C || latestRecord.coldTemperatureC > COLD_TEMP_MAX_C) {
      return 'critical'
    }
    if (latestRecord.coldTemperatureC < 1 || latestRecord.coldTemperatureC > 6) {
      return 'warning'
    }
    return 'normal'
  }, [latestRecord])

  const mobileTiltTone = useMemo(() => {
    if (!latestRecord) return 'normal'
    if (latestRecord.tiltDeg > 35) return 'critical'
    if (latestRecord.tiltDeg > TILT_ALERT_THRESHOLD || latestRecord.tiltDetected) return 'warning'
    return 'normal'
  }, [latestRecord])

  const mobileHotLeakTone = latestRecord?.hotLeakDetected ? 'critical' : 'normal'
  const mobileColdLeakTone = latestRecord?.coldLeakDetected ? 'critical' : 'normal'

  // Sync delivery status from backend on mount, then every 10 s
  useEffect(() => {
    const initializeDeliveryState = async () => {
      try {
        const res = await fetch(`/api/delivery/status?bagId=${encodeURIComponent(MOBILE_BAG_ID)}`)
        if (res.ok) {
          const data = await res.json()

          // Always start with a clean state on app load.
          // If a previous session is still marked IN_TRANSIT, auto-end it.
          if (data.status === 'IN_TRANSIT') {
            await fetch('/api/delivery/end', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bagId: MOBILE_BAG_ID }),
            })
          }
        }
      } catch {
        // ignore init errors; regular sync will retry
      } finally {
        syncDeliveryStatus()
      }
    }

    initializeDeliveryState()
    const interval = setInterval(syncDeliveryStatus, 10_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadDeliveryOptions = async () => {
      try {
        const [riders, routes] = await Promise.all([fetchRiders('active'), fetchRoutes()])
        if (cancelled) return
        setDeliveryRiders(riders)
        setDeliveryRoutes(routes)
      } catch {
        if (cancelled) return
        setDeliveryRiders([])
        setDeliveryRoutes([])
      }
    }

    loadDeliveryOptions()
    return () => {
      cancelled = true
    }
  }, [])

  // Delivery timer: tick every second while IN_TRANSIT
  useEffect(() => {
    if (deliveryStatus !== 'IN_TRANSIT' || !deliveryStartTime) {
      setElapsedSeconds(0)
      return
    }
    const startMs = new Date(deliveryStartTime).getTime()
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deliveryStatus, deliveryStartTime])

  useEffect(() => {
    if (!isMobileView) {
      if (geoWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchRef.current)
        geoWatchRef.current = null
      }
      return
    }

    if (!navigator.geolocation) {
      return
    }

    geoWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setMobileLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          isReal: true,
        })
      },
      () => {
        setMobileLocation({
          latitude: BASE_LOCATION.latitude,
          longitude: BASE_LOCATION.longitude,
          isReal: false,
        })
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    )

    return () => {
      if (geoWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchRef.current)
        geoWatchRef.current = null
      }
    }
  }, [isMobileView])

  const dismissActiveAlert = () => {
    if (!activeAlert) {
      return
    }

    setMobileAlerts((currentAlerts) => currentAlerts.filter((alert) => alert.id !== activeAlert.id))
    setActiveAlert(null)
  }

  const handleAlertPrimaryAction = () => {
    dismissActiveAlert()
  }

  const handleAlertCancel = () => {
    dismissActiveAlert()
  }

  const formatElapsedTime = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  }

  return (
    <main className={`dashboard-shell ${isMobileView ? 'dashboard-shell-mobile' : ''}`}>
      <header className="page-header panel">
        <div className="dashboard-header-row">
          <div>
            <p className="eyebrow">Operations Overview</p>
            <h1>Food Delivery Bag Monitoring</h1>
            <p className="dashboard-subtitle">
              High-level monitoring view for delivery bag health, environmental stability, and anomaly-driven
              decision support.
            </p>
          </div>

          <button
            type="button"
            className={`mobile-view-toggle ${isMobileView ? 'mobile-view-toggle-active' : ''}`}
            onClick={() => setIsMobileView((current) => !current)}
          >
            {isMobileView ? '← Exit Mobile View' : '📱 Mobile View'}
          </button>
        </div>
        {!isMobileView && <PageTabs />}
      </header>

      {isMobileView ? (
        <section className="mobile-fullscreen-stage">
          <MobileContainer>
            <div className="mobile-content">
              <StatusCard
                bagId={latestRecord?.bagId ?? MOBILE_BAG_ID}
                isClosed={!Boolean(latestRecord?.lidOpen)}
                deliveryStatus={deliveryStatus}
              />

              <div className="mobile-sensor-grid">
                <SensorCard
                  icon="🌡️"
                  label="Hot Temp"
                  value={latestRecord ? `${latestRecord.temperatureC.toFixed(1)}°C` : '--'}
                  tone={mobileTemperatureTone}
                />
                <SensorCard
                  icon="🧊"
                  label="Cold Temp"
                  value={latestRecord?.coldTemperatureC !== undefined ? `${latestRecord.coldTemperatureC.toFixed(1)}°C` : '--'}
                  tone={mobileColdTemperatureTone}
                />
                <SensorCard
                  icon="💧"
                  label="Humidity"
                  value={latestRecord ? `${latestRecord.humidityPct.toFixed(1)}%` : '--'}
                  tone={mobileHumidityTone}
                />
                <SensorCard
                  icon="📐"
                  label="Tilt Angle"
                  value={latestRecord ? `${latestRecord.tiltDeg.toFixed(1)}°` : '--'}
                  tone={mobileTiltTone}
                />
                <SensorCard
                  icon="🚿"
                  label="Hot Leak"
                  value={latestRecord?.hotLeakDetected ? 'Detected' : 'Clear'}
                  tone={mobileHotLeakTone}
                />
                <SensorCard
                  icon="🧊"
                  label="Cold Leak"
                  value={latestRecord?.coldLeakDetected ? 'Detected' : 'Clear'}
                  tone={mobileColdLeakTone}
                />
              </div>

              <MobileMapCard
                bagId={latestRecord?.bagId ?? MOBILE_BAG_ID}
                latitude={mobileLocation.latitude}
                longitude={mobileLocation.longitude}
                accuracy={mobileLocation.accuracy}
                isReal={mobileLocation.isReal}
              />

              {/* ── Delivery Control ── */}
              <div className="mobile-delivery-control-card mobile-card">
                <div className="mobile-delivery-control-header">
                  <span className={`mobile-delivery-status-badge badge-${deliveryStatus.toLowerCase()}`}>
                    {deliveryStatus === 'IN_TRANSIT' ? '🚚 IN TRANSIT' : deliveryStatus === 'COMPLETED' ? '✅ COMPLETED' : '⏸ IDLE'}
                  </span>
                  {deliveryStatus === 'IN_TRANSIT' && (
                    <span className="mobile-delivery-timer">⏱ {formatElapsedTime(elapsedSeconds)}</span>
                  )}
                </div>

                {deliveryId && (
                  <p className="mobile-delivery-id">
                    <span className="delivery-id-label">Session</span>
                    <span className="delivery-id-value">{deliveryId}</span>
                  </p>
                )}

                <div className="mobile-delivery-form-grid">
                  <label className="mobile-delivery-field">
                    <span>Rider</span>
                    <select
                      value={selectedRiderId}
                      disabled={deliveryStatus === 'IN_TRANSIT' || deliveryActionPending !== null}
                      onChange={(event) => {
                        setSelectedRiderId(event.target.value)
                        setDeliveryError(null)
                      }}
                    >
                      <option value="">Select rider</option>
                      {deliveryRiders.map((rider) => (
                        <option key={rider.id} value={rider.id}>
                          {rider.name} · {rider.phone}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mobile-delivery-field">
                    <span>Route</span>
                    <select
                      value={selectedRouteId}
                      disabled={deliveryStatus === 'IN_TRANSIT' || deliveryActionPending !== null}
                      onChange={(event) => {
                        setSelectedRouteId(event.target.value)
                        setDeliveryError(null)
                      }}
                    >
                      <option value="">Select route</option>
                      {deliveryRoutes.map((routeOption) => (
                        <option key={routeOption.id} value={routeOption.id}>
                          {routeOption.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {(deliveryStatus === 'IN_TRANSIT' || activeRiderName || activeRouteName) && (
                  <div className="mobile-delivery-assignment-summary">
                    <div className="mobile-delivery-assignment-row">
                      <span>Rider</span>
                      <strong>{activeRiderName ?? selectedRider?.name ?? '—'}</strong>
                    </div>
                    <div className="mobile-delivery-assignment-row">
                      <span>Route</span>
                      <strong>{activeRouteName ?? selectedRoute?.name ?? '—'}</strong>
                    </div>
                    {(activeRouteStartLocation || selectedRoute?.startLocation || activeRouteEndLocation || selectedRoute?.endLocation) && (
                      <div className="mobile-delivery-assignment-row compact">
                        <span>Path</span>
                        <strong>
                          {(activeRouteStartLocation ?? selectedRoute?.startLocation ?? '—')}
                          {' → '}
                          {(activeRouteEndLocation ?? selectedRoute?.endLocation ?? '—')}
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {deliveryError && <p className="mobile-delivery-error">{deliveryError}</p>}

                {deliveryStatus === 'IDLE' || deliveryStatus === 'COMPLETED' ? (
                  <button
                    type="button"
                    className="mobile-delivery-btn btn-start"
                    onClick={startDelivery}
                    disabled={deliveryActionPending !== null}
                  >
                    {deliveryActionPending === 'start' ? 'Starting...' : '🚀 Start Delivery'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mobile-delivery-btn btn-end"
                    onClick={endDelivery}
                    disabled={deliveryActionPending === 'end'}
                  >
                    {deliveryActionPending === 'end' ? 'Ending...' : '🏁 End Delivery'}
                  </button>
                )}

                {deliveryStatus === 'IDLE' && (
                  <p className="mobile-delivery-hint">Select both rider and route to begin tracking.</p>
                )}
                {deliveryStatus === 'COMPLETED' && (
                  <p className="mobile-delivery-hint">Last delivery completed. Start a new one?</p>
                )}
              </div>
            </div>

            {activeAlert && (
              <AlertPopup
                tone={activeAlert.tone}
                message={activeAlert.message}
                onCancel={handleAlertCancel}
                onConfirm={handleAlertPrimaryAction}
              />
            )}

          </MobileContainer>
        </section>
      ) : (
        <>
          <DashboardFilters
            filters={filters}
            bagOptions={bagOptions}
            routeOptions={routeOptions}
            onChange={setFilters}
          />

          <section className="kpi-grid">
            {kpis.map((metric) => (
              <KpiCard key={metric.label} metric={metric} />
            ))}
          </section>

          <section className="overview-trend-row">
            <TemperatureHumidityChart data={trendData} />
          </section>

          <section className="overview-row-primary">
            <TiltEventTimeline data={tiltEvents} />
            <AnomalyBarChart data={anomalyData} />
          </section>

          <section className="overview-row-secondary">
            <LeakDetectionStatusCard summary={leakStatus} trendData={leakTrendData} />
            <BagOpenCloseTimeline data={bagLidEvents} />
          </section>
        </>
      )}

    </main>
  )
}

export default DashboardPage
