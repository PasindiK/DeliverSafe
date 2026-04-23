import type { DeliveryPhase, SensorRecord, SignalQuality } from '../types/dashboard'

const BAG_IDS = ['BAG-101', 'BAG-204', 'BAG-330'] as const
const ROUTE_BY_BAG: Record<(typeof BAG_IDS)[number], string> = {
  'BAG-101': 'Colombo 07 → Colombo 04',
  'BAG-204': 'Malabe → Battaramulla',
  'BAG-330': 'Kandy Town → Peradeniya',
}

const HOURS_OF_DATA = 72
export const LIVE_REFRESH_INTERVAL_MS = 5000

interface BagProfile {
  humidityBaseline: number
  temperatureBaseline: number
  roughnessFactor: number
  leakSensitivity: number
  signalRisk: number
  pickupOpenHour: number
  pickupCloseHour: number
  dropoffOpenHour: number
  dropoffCloseHour: number
}

interface BagSimulationState {
  lidOpen: boolean
  transitOpenHoursRemaining: number
  leakHoursRemaining: number
}

const createDefaultSimulationState = (): BagSimulationState => ({
  lidOpen: false,
  transitOpenHoursRemaining: 0,
  leakHoursRemaining: 0,
})

const BAG_PROFILES: Record<(typeof BAG_IDS)[number], BagProfile> = {
  'BAG-101': {
    humidityBaseline: 62,
    temperatureBaseline: 47.5,
    roughnessFactor: 0.35,
    leakSensitivity: 0.32,
    signalRisk: 0.24,
    pickupOpenHour: 8,
    pickupCloseHour: 10,
    dropoffOpenHour: 20,
    dropoffCloseHour: 22,
  },
  'BAG-204': {
    humidityBaseline: 66,
    temperatureBaseline: 66.2,
    roughnessFactor: 0.48,
    leakSensitivity: 0.44,
    signalRisk: 0.34,
    pickupOpenHour: 9,
    pickupCloseHour: 10,
    dropoffOpenHour: 20,
    dropoffCloseHour: 21,
  },
  'BAG-330': {
    humidityBaseline: 69,
    temperatureBaseline: 55.8,
    roughnessFactor: 0.61,
    leakSensitivity: 0.56,
    signalRisk: 0.42,
    pickupOpenHour: 8,
    pickupCloseHour: 9,
    dropoffOpenHour: 21,
    dropoffCloseHour: 22,
  },
}

const roundToSingleDecimal = (value: number) => Number(value.toFixed(1))

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value))
}

const seededNoise = (seriesIndex: number, bagIndex: number, channel: number) => {
  const seed = Math.sin((seriesIndex + 1) * 12.9898 + (bagIndex + 1) * 78.233 + channel * 37.719)
  const normalized = seed * 43758.5453
  return normalized - Math.floor(normalized)
}

const getDeliveryPhase = (timestamp: Date): DeliveryPhase => {
  const hour = timestamp.getHours()
  if (hour >= 8 && hour < 11) {
    return 'Pickup'
  }

  if (hour >= 11 && hour < 20) {
    return 'Transit'
  }

  return 'Dropoff'
}

const resolveSignalQuality = (
  seriesIndex: number,
  bagIndex: number,
  profile: BagProfile,
  rainfallMm: number,
): SignalQuality => {
  const offlineRoll = seededNoise(seriesIndex, bagIndex, 8)
  const weakRoll = seededNoise(seriesIndex, bagIndex, 9)

  const weatherOfflineRisk = rainfallMm > 4 ? 0.24 + profile.signalRisk * 0.28 : 0
  const baselineOfflineRisk = 0.008 + profile.signalRisk * 0.015

  if (offlineRoll < weatherOfflineRisk || offlineRoll < baselineOfflineRisk) {
    return 'Offline'
  }

  const weatherWeakRisk = rainfallMm > 1.5 ? 0.3 : 0
  const baselineWeakRisk = 0.09 + profile.signalRisk * 0.08

  if (weakRoll < weatherWeakRisk || weakRoll < baselineWeakRisk) {
    return 'Weak'
  }

  return 'Good'
}

const buildReading = (
  bagId: (typeof BAG_IDS)[number],
  bagIndex: number,
  timestamp: Date,
  seriesIndex: number,
  simulationState: BagSimulationState,
): SensorRecord => {
  const profile = BAG_PROFILES[bagId]
  const deliveryPhase = getDeliveryPhase(timestamp)
  const hourOfDay = timestamp.getHours()

  const isPlannedOpenHour =
    hourOfDay === profile.pickupOpenHour || hourOfDay === profile.dropoffOpenHour
  const isPlannedCloseHour =
    hourOfDay === profile.pickupCloseHour || hourOfDay === profile.dropoffCloseHour

  if (isPlannedOpenHour) {
    simulationState.lidOpen = true
    simulationState.transitOpenHoursRemaining = 0
  }

  if (isPlannedCloseHour && simulationState.transitOpenHoursRemaining === 0) {
    simulationState.lidOpen = false
  }

  const weatherTemperatureC = roundToSingleDecimal(
    27.6 +
      Math.sin((seriesIndex + 4) / 9) * 2.9 +
      (seededNoise(seriesIndex, bagIndex, 1) - 0.5) * 1.2,
  )

  const stormSignal = (Math.sin((seriesIndex + bagIndex * 2) / 7.5) + 1) / 2
  const rainfallRoll = seededNoise(seriesIndex, bagIndex, 2)

  let rainfallMm = 0

  if (stormSignal > 0.78 && rainfallRoll > 0.34) {
    rainfallMm = roundToSingleDecimal(2 + rainfallRoll * 4.6)
  } else if (stormSignal > 0.58 && rainfallRoll > 0.7) {
    rainfallMm = roundToSingleDecimal(0.6 + rainfallRoll * 2.2)
  }

  const tiltBase =
    3.4 +
    Math.abs(Math.sin((seriesIndex + bagIndex * 3) / 3.8)) * 5.5 +
    (seededNoise(seriesIndex, bagIndex, 3) - 0.5) * 1.6

  const potholeChance = deliveryPhase === 'Transit' ? 0.08 + profile.roughnessFactor * 0.06 : 0.02
  const hasPotholeEvent = seededNoise(seriesIndex, bagIndex, 4) < potholeChance
  const potholeSpike = hasPotholeEvent ? 12 + seededNoise(seriesIndex, bagIndex, 5) * 18 : 0
  const rainImpactTilt = rainfallMm > 3 ? 2.8 : 0

  const provisionalTilt = tiltBase + potholeSpike + rainImpactTilt + (deliveryPhase === 'Transit' ? 2.2 : 0)
  const tiltDeg = roundToSingleDecimal(clamp(provisionalTilt, 1.4, 42))

  const transitOpenChance =
    deliveryPhase === 'Transit'
      ? 0.012 + profile.roughnessFactor * 0.02 + (tiltDeg > 27 ? 0.08 : 0)
      : 0

  if (
    deliveryPhase === 'Transit' &&
    !simulationState.lidOpen &&
    seededNoise(seriesIndex, bagIndex, 6) < transitOpenChance
  ) {
    simulationState.lidOpen = true
    simulationState.transitOpenHoursRemaining =
      seededNoise(seriesIndex, bagIndex, 7) > 0.55 ? 2 : 1
  }

  const lidOpen = simulationState.lidOpen
  const signalQuality = resolveSignalQuality(seriesIndex, bagIndex, profile, rainfallMm)

  let leakDetected = false

  if (simulationState.leakHoursRemaining > 0) {
    leakDetected = true
    simulationState.leakHoursRemaining -= 1
  } else {
    const leakRisk =
      (deliveryPhase === 'Transit' ? 0.007 : 0.002) +
      (tiltDeg > 26 ? 0.042 : 0) +
      (lidOpen && deliveryPhase === 'Transit' ? 0.03 : 0) +
      (rainfallMm > 3 ? 0.02 : 0) +
      profile.leakSensitivity * 0.017 +
      (signalQuality === 'Offline' ? 0.018 : 0)

    if (seededNoise(seriesIndex, bagIndex, 10) < leakRisk) {
      leakDetected = true
      simulationState.leakHoursRemaining = seededNoise(seriesIndex, bagIndex, 11) > 0.58 ? 2 : 1
    }
  }

  const hotLeakDetected = leakDetected
  const coldLeakDetected =
    (rainfallMm > 2.5 && seededNoise(seriesIndex, bagIndex, 15) > 0.82) ||
    (simulationState.leakHoursRemaining > 0 && seededNoise(seriesIndex, bagIndex, 16) > 0.88)

  const weatherCoolingImpact = weatherTemperatureC < 30 ? (30 - weatherTemperatureC) * 0.08 : 0
  const rainCoolingImpact = rainfallMm > 3 ? 1.6 : rainfallMm > 0 ? 0.7 : 0

  const temperatureDrift =
    Math.sin((seriesIndex + bagIndex) / 8.2) * 2.8 +
    (seededNoise(seriesIndex, bagIndex, 12) - 0.5) * 2.2 -
    (lidOpen ? 4.8 : 0) -
    (leakDetected ? 1.3 : 0) -
    (tiltDeg > 30 ? 0.8 : 0) -
    weatherCoolingImpact -
    rainCoolingImpact

  const temperatureC = roundToSingleDecimal(clamp(profile.temperatureBaseline + temperatureDrift, 30, 82))

  const humidityNoise = (seededNoise(seriesIndex, bagIndex, 13) - 0.5) * 5
  const humidityPct = roundToSingleDecimal(
    clamp(
      profile.humidityBaseline +
        Math.cos((seriesIndex + bagIndex * 2) / 6.2) * 7 +
        humidityNoise +
        (lidOpen ? 8.5 : 0) +
        (leakDetected ? 15 : 0) +
        rainfallMm * 1.5,
      46,
      99,
    ),
  )

  if (deliveryPhase === 'Transit' && simulationState.lidOpen && simulationState.transitOpenHoursRemaining > 0) {
    simulationState.transitOpenHoursRemaining -= 1
    if (simulationState.transitOpenHoursRemaining === 0) {
      simulationState.lidOpen = false
    }
  }

  const coldTemperatureC = roundToSingleDecimal(
    clamp(
      4.2 +
        Math.cos((seriesIndex + bagIndex * 1.7) / 7.4) * 1.6 +
        (seededNoise(seriesIndex, bagIndex, 14) - 0.5) * 1.8 +
        (lidOpen ? 2.2 : 0) +
        (leakDetected ? 1.1 : 0),
      -2,
      14,
    ),
  )

  return {
    id: `${bagId}-${timestamp.toISOString()}`,
    timestamp: timestamp.toISOString(),
    bagId,
    route: ROUTE_BY_BAG[bagId],
    temperatureC,
    coldTemperatureC,
    humidityPct,
    tiltDeg,
    tiltDetected: tiltDeg >= 20,
    hotLeakDetected,
    coldLeakDetected,
    leakDetected: hotLeakDetected || coldLeakDetected,
    lidOpen,
    deliveryPhase,
    weatherTemperatureC,
    rainfallMm,
    signalQuality,
  }
}

const bagSimulationState = new Map<(typeof BAG_IDS)[number], BagSimulationState>(
  BAG_IDS.map((bagId) => [bagId, createDefaultSimulationState()]),
)

let liveSeriesIndex = HOURS_OF_DATA

const getStreamStateForBag = (bagId: (typeof BAG_IDS)[number]) => {
  const existing = bagSimulationState.get(bagId)

  if (existing) {
    return existing
  }

  const fallbackState = createDefaultSimulationState()
  bagSimulationState.set(bagId, fallbackState)
  return fallbackState
}

const trimRecordsToRetentionWindow = (records: SensorRecord[], latestTimestampIso: string) => {
  const latestTimestamp = new Date(latestTimestampIso).getTime()
  const cutoffTimestamp = latestTimestamp - HOURS_OF_DATA * 60 * 60 * 1000

  return records.filter((record) => new Date(record.timestamp).getTime() >= cutoffTimestamp)
}

export const sensorRecords: SensorRecord[] = Array.from({ length: HOURS_OF_DATA }).flatMap(
  (_, index) => {
    const hourOffset = HOURS_OF_DATA - index - 1
    const timestamp = new Date(Date.now() - hourOffset * 60 * 60 * 1000)

    return BAG_IDS.map((bagId, bagIndex) =>
      buildReading(bagId, bagIndex, timestamp, index, getStreamStateForBag(bagId)),
    )
  },
)

export const appendLiveSensorBatch = (
  records: SensorRecord[],
  timestamp: Date = new Date(),
): SensorRecord[] => {
  const nextBatch = BAG_IDS.map((bagId, bagIndex) =>
    buildReading(bagId, bagIndex, timestamp, liveSeriesIndex, getStreamStateForBag(bagId)),
  )

  liveSeriesIndex += 1

  return trimRecordsToRetentionWindow(
    [...records, ...nextBatch],
    nextBatch[nextBatch.length - 1].timestamp,
  )
}
