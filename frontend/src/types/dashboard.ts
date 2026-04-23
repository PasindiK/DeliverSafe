export type DeliveryPhase = 'Pickup' | 'Transit' | 'Dropoff'
export type SignalQuality = 'Good' | 'Weak' | 'Offline'
export type AlertSeverity = 'Low' | 'Medium' | 'High'
export type AlertStatus = 'Open' | 'Investigating' | 'Monitoring'
export type KpiTrendDirection = 'up' | 'down' | 'flat'
export type KpiTone = 'safe' | 'warning' | 'critical' | 'neutral'

export interface SensorRecord {
  id: string
  timestamp: string
  bagId: string
  route: string
  routeId?: string | null
  routeName?: string | null
  routeStartLocation?: string | null
  routeEndLocation?: string | null
  riderId?: string | null
  riderName?: string | null
  temperatureC: number
  coldTemperatureC?: number
  humidityPct: number
  tiltDeg: number
  tiltDetected: boolean
  hotLeakSensorId?: string
  coldLeakSensorId?: string
  hotTempSensorId?: string
  coldTempSensorId?: string
  reedSensorId?: string
  tiltSensorId?: string
  hotLeakDetected: boolean
  coldLeakDetected: boolean
  leakDetected: boolean
  lidOpen: boolean
  deliveryPhase: DeliveryPhase
  weatherTemperatureC: number
  rainfallMm: number
  signalQuality: SignalQuality
  // Delivery session — stamped at MQTT ingest time by the backend.
  // Optional: records ingested before this feature was added will not have these fields.
  eventType?: 'SENSOR' | 'DELIVERY_START' | 'DELIVERY_END'
  deliveryId?: string | null
  deliveryStatus?: 'IDLE' | 'STARTED' | 'IN_TRANSIT' | 'COMPLETED'
  deliveryStartTime?: string | null
  deliveryEndTime?: string | null
}

export interface RiderOption {
  id: string
  name: string
  phone: string
  status: 'active' | 'inactive'
}

export interface RouteOption {
  id: string
  name: string
  startLocation: string
  endLocation: string
}

export interface DashboardFilters {
  bagId: string
  route: string
  hours: number
  anomaliesOnly: boolean
}

export interface KpiMetric {
  label: string
  value: string
  helper: string
  trendDirection: KpiTrendDirection
  trendText: string
  tone: KpiTone
}

export interface TrendPoint {
  time: string
  temperatureC: number
  coldTemperatureC?: number
  humidityPct: number
  anomalyCount: number
}

export interface AnomalyBreakdownItem {
  type: string
  count: number
}

export type TiltEventSeverity = 'Moderate' | 'Critical'

export interface TiltEventPoint {
  id: string
  timestamp: string
  epochTime: number
  timeLabel: string
  bagId: string
  bagOrder: number
  route: string
  tiltDeg: number
  severity: TiltEventSeverity
  deliveryPhase: DeliveryPhase
  rainfallMm: number
}

export type BagLidEventType = 'Open' | 'Close'

export interface BagLidEventPoint {
  id: string
  timestamp: string
  epochTime: number
  timeLabel: string
  bagId: string
  bagOrder: number
  route: string
  eventType: BagLidEventType
  deliveryPhase: DeliveryPhase
  isUnexpected: boolean
}

export interface LeakTrendPoint {
  time: string
  incidentCount: number
  impactedBagCount: number
}

export interface LeakStatusSummary {
  currentStatus: 'SAFE' | 'LEAK DETECTED'
  activeIncidentCount: number
  recentIncidentCount: number
  recentIncidentCountLast12h: number
  impactedBags: string[]
  latestIncidentAt: string | null
  latestIncidentBagId: string | null
}

export interface AlertItem {
  id: string
  timestamp: string
  time: string
  bagId: string
  route: string
  issue: string
  severity: AlertSeverity
  status: AlertStatus
}
