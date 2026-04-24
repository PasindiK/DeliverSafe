import type {
  AlertStatus,
  AlertItem,
  AlertSeverity,
  AnomalyBreakdownItem,
  BagLidEventPoint,
  DashboardFilters,
  KpiMetric,
  LeakStatusSummary,
  LeakTrendPoint,
  LeakBagDistributionItem,
  SensorRecord,
  TiltEventPoint,
  TrendPoint,
} from '../types/dashboard'

export const defaultDashboardFilters: DashboardFilters = {
  bagId: 'ALL',
  route: 'ALL',
  hours: 24,
  anomaliesOnly: false,
}

const WARM_HOLD_MIN_C = 40
const HOT_HOLD_MAX_C = 75
const COLD_HOLD_MIN_C = 0
const COLD_HOLD_MAX_C = 8
const TARGET_AVG_TEMPERATURE_C = (WARM_HOLD_MIN_C + HOT_HOLD_MAX_C) / 2

const isTemperatureOutOfRange = (temperatureC: number) => {
  return temperatureC < WARM_HOLD_MIN_C || temperatureC > HOT_HOLD_MAX_C
}

const isColdTemperatureOutOfRange = (temperatureC?: number) => {
  if (temperatureC === undefined || temperatureC === null || Number.isNaN(temperatureC)) {
    return false
  }
  return temperatureC < COLD_HOLD_MIN_C || temperatureC > COLD_HOLD_MAX_C
}

const formatTime = (isoString: string) => {
  return new Date(isoString).toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const getRecordIssues = (record: SensorRecord): string[] => {
  const issues: string[] = []

  if (isTemperatureOutOfRange(record.temperatureC)) {
    issues.push('Temperature outside warm/hot hold range')
  }

  if (isColdTemperatureOutOfRange(record.coldTemperatureC)) {
    issues.push('Cold compartment temperature outside safe range')
  }

  if (record.humidityPct > 85) {
    issues.push('Humidity above threshold')
  }

  if (record.tiltDeg > 25 || record.tiltDetected) {
    issues.push('Excessive bag tilt')
  }

  if (record.hotLeakDetected) {
    issues.push('Hot compartment leak detected')
  }

  if (record.coldLeakDetected) {
    issues.push('Cold compartment leak detected')
  }

  if (record.lidOpen && record.deliveryPhase === 'Transit') {
    issues.push('Lid opened during transit')
  }

  if (record.signalQuality === 'Offline') {
    issues.push('Sensor signal offline')
  }

  if (record.signalQuality === 'Weak') {
    issues.push('Sensor signal weak')
  }

  return issues
}

export const isAnomalousRecord = (record: SensorRecord) => {
  return getRecordIssues(record).length > 0
}

export const getAlertSeverity = (record: SensorRecord): AlertSeverity => {
  if (
    record.hotLeakDetected ||
    record.coldLeakDetected ||
    record.signalQuality === 'Offline' ||
    isTemperatureOutOfRange(record.temperatureC) ||
    isColdTemperatureOutOfRange(record.coldTemperatureC)
  ) {
    return 'High'
  }

  if (record.tiltDeg > 25 || record.tiltDetected || (record.lidOpen && record.deliveryPhase === 'Transit')) {
    return 'Medium'
  }

  return 'Low'
}

export const getAlertStatus = (severity: AlertSeverity): AlertStatus => {
  if (severity === 'High') {
    return 'Open'
  }

  if (severity === 'Medium') {
    return 'Investigating'
  }

  return 'Monitoring'
}

export const filterRecords = (records: SensorRecord[], filters: DashboardFilters): SensorRecord[] => {
  if (records.length === 0) {
    return []
  }

  const latestTimestamp = new Date(records[records.length - 1].timestamp).getTime()
  const cutoff = latestTimestamp - filters.hours * 60 * 60 * 1000

  return records.filter((record) => {
    const inTimeWindow = new Date(record.timestamp).getTime() >= cutoff
    const bagMatch = filters.bagId === 'ALL' || record.bagId === filters.bagId
    const routeMatch = filters.route === 'ALL' || record.route === filters.route
    const anomalyMatch = !filters.anomaliesOnly || isAnomalousRecord(record)

    return inTimeWindow && bagMatch && routeMatch && anomalyMatch
  })
}

const calculateDeltaPercent = (currentValue: number, previousValue: number) => {
  if (previousValue === 0) {
    return currentValue === 0 ? 0 : 100
  }

  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100
}

const getTrendDescriptor = (
  currentValue: number,
  previousValue: number,
): { trendDirection: KpiMetric['trendDirection']; trendText: string } => {
  const delta = calculateDeltaPercent(currentValue, previousValue)

  if (Math.abs(delta) < 0.5) {
    return {
      trendDirection: 'flat' as const,
      trendText: '• Stable vs previous window',
    }
  }

  const trendDirection: KpiMetric['trendDirection'] = delta > 0 ? 'up' : 'down'
  const arrow = trendDirection === 'up' ? '▲' : '▼'

  return {
    trendDirection,
    trendText: `${arrow} ${Math.abs(delta).toFixed(1)}% vs previous window`,
  }
}

const countUniqueBags = (records: SensorRecord[]) => {
  return new Set(records.map((record) => record.bagId)).size
}

const countTotalAlerts = (records: SensorRecord[]) => {
  return records.filter(isAnomalousRecord).length
}

const getAverageTemperature = (records: SensorRecord[]) => {
  if (records.length === 0) {
    return 0
  }

  return records.reduce((total, record) => total + record.temperatureC, 0) / records.length
}

const getAnomalyRate = (records: SensorRecord[]) => {
  if (records.length === 0) {
    return 0
  }

  return (countTotalAlerts(records) / records.length) * 100
}

const countEventTransitionsByBag = (
  records: SensorRecord[],
  getState: (record: SensorRecord) => boolean,
) => {
  if (records.length === 0) {
    return 0
  }

  const lastStateByBag = new Map<string, boolean>()
  let transitionCount = 0

  records
    .slice()
    .sort((first, second) => new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime())
    .forEach((record) => {
      const previousState = lastStateByBag.get(record.bagId) ?? false
      const currentState = getState(record)

      if (!previousState && currentState) {
        transitionCount += 1
      }

      lastStateByBag.set(record.bagId, currentState)
    })

  return transitionCount
}

const countTiltDetections = (records: SensorRecord[]) => {
  return countEventTransitionsByBag(records, (record) => record.tiltDeg >= 20 || record.tiltDetected)
}

const countLeakDetections = (records: SensorRecord[]) => {
  return countEventTransitionsByBag(records, (record) => record.leakDetected)
}

const countBagOpeningEvents = (records: SensorRecord[]) => {
  return countEventTransitionsByBag(records, (record) => record.lidOpen)
}

const getRateFromRecords = (count: number, records: SensorRecord[]) => {
  if (records.length === 0) {
    return 0
  }

  return (count / records.length) * 100
}

const getRateTone = (rate: number, warningThreshold: number, criticalThreshold: number): KpiMetric['tone'] => {
  if (rate < warningThreshold) {
    return 'safe'
  }

  if (rate < criticalThreshold) {
    return 'warning'
  }

  return 'critical'
}

const getTargetDeviationDescriptor = (
  currentValue: number,
  targetValue: number,
): { trendDirection: KpiMetric['trendDirection']; trendText: string } => {
  const deviation = currentValue - targetValue

  if (Math.abs(deviation) < 0.5) {
    return {
      trendDirection: 'flat',
      trendText: '• Current average aligned with target',
    }
  }

  if (deviation > 0) {
    return {
      trendDirection: 'up',
      trendText: `▲ Current average +${deviation.toFixed(1)}°C vs target`,
    }
  }

  return {
    trendDirection: 'down',
    trendText: `▼ Current average ${Math.abs(deviation).toFixed(1)}°C below target`,
  }
}

export const buildKpiMetrics = (records: SensorRecord[]): KpiMetric[] => {
  if (records.length === 0) {
    return [
      {
        label: 'Active Delivery Bags',
        value: '0',
        helper: 'Bags currently streaming',
        trendDirection: 'flat',
        trendText: '• Stable vs previous window',
        tone: 'safe',
      },
      {
        label: 'Target Avg Temperature',
        value: `${TARGET_AVG_TEMPERATURE_C.toFixed(1)}°C`,
        helper: 'Expected bag average for warm + hot hold operations',
        trendDirection: 'flat',
        trendText: '• Waiting for live readings',
        tone: 'safe',
      },
      {
        label: 'Anomaly Rate',
        value: '0.0%',
        helper: 'No anomaly records detected',
        trendDirection: 'flat',
        trendText: '• Stable vs previous window',
        tone: 'safe',
      },
      {
        label: 'Tilt Detections',
        value: '0',
        helper: 'No rough handling events detected',
        trendDirection: 'flat',
        trendText: '• Stable vs previous window',
        tone: 'safe',
      },
      {
        label: 'Leak Detections',
        value: '0',
        helper: 'No leak start events detected',
        trendDirection: 'flat',
        trendText: '• Stable vs previous window',
        tone: 'safe',
      },
      {
        label: 'Bag Opening Events',
        value: '0',
        helper: 'No opening state changes detected',
        trendDirection: 'flat',
        trendText: '• Stable vs previous window',
        tone: 'safe',
      },
    ]
  }

  const splitIndex = Math.max(1, Math.floor(records.length / 2))
  const previousWindow = records.slice(0, splitIndex)
  const currentWindow = records.slice(splitIndex)

  const baselineWindow = currentWindow.length === 0 ? records : currentWindow

  const activeDeliveryBags = countUniqueBags(baselineWindow)
  const averageTemperature = getAverageTemperature(baselineWindow)
  const anomalyRate = getAnomalyRate(baselineWindow)
  const tiltDetections = countTiltDetections(baselineWindow)
  const leakDetections = countLeakDetections(baselineWindow)
  const bagOpeningEvents = countBagOpeningEvents(baselineWindow)

  const activeBagTrend = getTrendDescriptor(activeDeliveryBags, countUniqueBags(previousWindow))
  const temperatureTargetDelta = getTargetDeviationDescriptor(
    averageTemperature,
    TARGET_AVG_TEMPERATURE_C,
  )
  const anomalyRateTrend = getTrendDescriptor(anomalyRate, getAnomalyRate(previousWindow))
  const tiltDetectionsTrend = getTrendDescriptor(tiltDetections, countTiltDetections(previousWindow))
  const leakDetectionsTrend = getTrendDescriptor(leakDetections, countLeakDetections(previousWindow))
  const bagOpeningsTrend = getTrendDescriptor(
    bagOpeningEvents,
    countBagOpeningEvents(previousWindow),
  )

  const avgTemperatureTone: KpiMetric['tone'] =
    averageTemperature >= WARM_HOLD_MIN_C && averageTemperature <= HOT_HOLD_MAX_C
      ? 'safe'
      : averageTemperature >= 35 && averageTemperature <= 80
        ? 'warning'
        : 'critical'

  const anomalyRateTone: KpiMetric['tone'] =
    anomalyRate < 8 ? 'safe' : anomalyRate < 16 ? 'warning' : 'critical'

  const tiltDetectionRate = getRateFromRecords(tiltDetections, baselineWindow)
  const leakDetectionRate = getRateFromRecords(leakDetections, baselineWindow)
  const bagOpeningRate = getRateFromRecords(bagOpeningEvents, baselineWindow)

  const tiltDetectionsTone = getRateTone(tiltDetectionRate, 8, 16)
  const leakDetectionsTone = getRateTone(leakDetectionRate, 2, 6)
  const bagOpeningsTone = getRateTone(bagOpeningRate, 12, 20)

  return [
    {
      label: 'Active Delivery Bags',
      value: `${activeDeliveryBags}`,
      helper: `${baselineWindow.length} readings in selected time range`,
      trendDirection: activeBagTrend.trendDirection,
      trendText: activeBagTrend.trendText,
      tone: 'safe',
    },
    {
      label: 'Target Avg Temperature',
      value: `${TARGET_AVG_TEMPERATURE_C.toFixed(1)}°C`,
      helper: `Current avg: ${averageTemperature.toFixed(1)}°C | Target band: 40°C–75°C`,
      trendDirection: temperatureTargetDelta.trendDirection,
      trendText: temperatureTargetDelta.trendText,
      tone: avgTemperatureTone,
    },
    {
      label: 'Anomaly Rate',
      value: `${anomalyRate.toFixed(1)}%`,
      helper: 'Anomaly records over total readings',
      trendDirection: anomalyRateTrend.trendDirection,
      trendText: anomalyRateTrend.trendText,
      tone: anomalyRateTone,
    },
    {
      label: 'Tilt Detections',
      value: `${tiltDetections}`,
      helper: `Threshold crossings at ≥20° (${tiltDetectionRate.toFixed(1)}% of readings)`,
      trendDirection: tiltDetectionsTrend.trendDirection,
      trendText: tiltDetectionsTrend.trendText,
      tone: tiltDetectionsTone,
    },
    {
      label: 'Leak Detections',
      value: `${leakDetections}`,
      helper: `Leak start events (${leakDetectionRate.toFixed(1)}% of readings)`,
      trendDirection: leakDetectionsTrend.trendDirection,
      trendText: leakDetectionsTrend.trendText,
      tone: leakDetectionsTone,
    },
    {
      label: 'Bag Opening Events',
      value: `${bagOpeningEvents}`,
      helper: `Open state changes (${bagOpeningRate.toFixed(1)}% of readings)`,
      trendDirection: bagOpeningsTrend.trendDirection,
      trendText: bagOpeningsTrend.trendText,
      tone: bagOpeningsTone,
    },
  ]
}

export const buildTrendData = (records: SensorRecord[]): TrendPoint[] => {
  const grouped = new Map<
    string,
    {
      temperatureTotal: number
      coldTemperatureTotal: number
      coldTemperatureCount: number
      humidityTotal: number
      count: number
      anomalyCount: number
    }
  >()

  records.forEach((record) => {
    const existing =
      grouped.get(record.timestamp) ??
      {
        temperatureTotal: 0,
        coldTemperatureTotal: 0,
        coldTemperatureCount: 0,
        humidityTotal: 0,
        count: 0,
        anomalyCount: 0,
      }

    existing.temperatureTotal += record.temperatureC
    if (record.coldTemperatureC !== undefined) {
      existing.coldTemperatureTotal += record.coldTemperatureC
      existing.coldTemperatureCount += 1
    }
    existing.humidityTotal += record.humidityPct
    existing.count += 1
    existing.anomalyCount += isAnomalousRecord(record) ? 1 : 0
    grouped.set(record.timestamp, existing)
  })

  return Array.from(grouped.entries())
    .sort(([timeA], [timeB]) => new Date(timeA).getTime() - new Date(timeB).getTime())
    .map(([timestamp, value]) => ({
      timestamp,
      epochTime: new Date(timestamp).getTime(),
      time: new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      temperatureC: Number((value.temperatureTotal / value.count).toFixed(2)),
      coldTemperatureC:
        value.coldTemperatureCount > 0
          ? Number((value.coldTemperatureTotal / value.coldTemperatureCount).toFixed(2))
          : undefined,
      humidityPct: Number((value.humidityTotal / value.count).toFixed(2)),
      anomalyCount: value.anomalyCount,
    }))
}

export const buildAnomalyBreakdown = (records: SensorRecord[]): AnomalyBreakdownItem[] => {
  const counts: Record<string, number> = {
    'Temperature Breach': 0,
    'Cold Temp Breach': 0,
    'Excessive Tilt': 0,
    'High Humidity': 0,
    'Leak Detection': 0,
    'Offline Sensor': 0,
  }

  records.forEach((record) => {
    if (isTemperatureOutOfRange(record.temperatureC)) {
      counts['Temperature Breach'] += 1
    }

    if (isColdTemperatureOutOfRange(record.coldTemperatureC)) {
      counts['Cold Temp Breach'] += 1
    }

    if (record.tiltDeg > 25 || record.tiltDetected) {
      counts['Excessive Tilt'] += 1
    }

    if (record.humidityPct > 85) {
      counts['High Humidity'] += 1
    }

    if (record.leakDetected) {
      counts['Leak Detection'] += 1
    }

    if (record.signalQuality === 'Offline') {
      counts['Offline Sensor'] += 1
    }
  })

  return Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
}

const buildBagOrderMap = (records: SensorRecord[]) => {
  const uniqueBags = Array.from(new Set(records.map((record) => record.bagId))).sort()

  return new Map(uniqueBags.map((bagId, index) => [bagId, index + 1]))
}

export const buildTiltEventPoints = (records: SensorRecord[]): TiltEventPoint[] => {
  if (records.length === 0) {
    return []
  }

  const bagOrderMap = buildBagOrderMap(records)
  const lastSeverityByBag = new Map<string, TiltEventPoint['severity'] | null>()

  return records
    .slice()
    .sort((first, second) => new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime())
    .flatMap((record) => {
      const aboveThreshold = record.tiltDeg >= 20 || record.tiltDetected
      const previousSeverity = lastSeverityByBag.get(record.bagId) ?? null

      if (!aboveThreshold) {
        lastSeverityByBag.set(record.bagId, null)
        return []
      }

      const severity: TiltEventPoint['severity'] = record.tiltDeg >= 30 ? 'Critical' : 'Moderate'
      const shouldEmit =
        previousSeverity === null || (previousSeverity === 'Moderate' && severity === 'Critical')

      lastSeverityByBag.set(record.bagId, severity)

      if (!shouldEmit) {
        return []
      }

      return [
        {
          id: `${record.id}-tilt`,
          timestamp: record.timestamp,
          epochTime: new Date(record.timestamp).getTime(),
          timeLabel: new Date(record.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          bagId: record.bagId,
          bagOrder: bagOrderMap.get(record.bagId) ?? 0,
          route: record.route,
          tiltDeg: record.tiltDeg,
          severity,
          deliveryPhase: record.deliveryPhase,
          rainfallMm: record.rainfallMm,
        } satisfies TiltEventPoint,
      ]
    })
}

export const buildBagLidEventPoints = (records: SensorRecord[]): BagLidEventPoint[] => {
  if (records.length === 0) {
    return []
  }

  const normalizeDeliveryStatus = (
    record: SensorRecord,
  ): 'IDLE' | 'STARTED' | 'IN_TRANSIT' | 'COMPLETED' => {
    if (record.deliveryStatus) {
      return record.deliveryStatus
    }

    if (record.deliveryPhase === 'Transit') return 'IN_TRANSIT'
    if (record.deliveryPhase === 'Dropoff') return 'COMPLETED'
    return 'STARTED'
  }

  const bagOrderMap = buildBagOrderMap(records)
  const latestLidStateByBag = new Map<string, boolean>()
  const hasInitialEventByBag = new Map<string, boolean>()

  return records
    .slice()
    .sort((first, second) => new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime())
    .flatMap((record) => {
      const hadState = latestLidStateByBag.has(record.bagId)
      const previousState = latestLidStateByBag.get(record.bagId) ?? false
      const currentState = record.lidOpen

      latestLidStateByBag.set(record.bagId, currentState)

      const shouldEmitInitial = !hadState && !hasInitialEventByBag.get(record.bagId)
      const didTransition = previousState !== currentState

      if (!shouldEmitInitial && !didTransition) {
        return []
      }

      if (shouldEmitInitial) {
        hasInitialEventByBag.set(record.bagId, true)
      }

      return [
        {
          id: `${record.id}-${currentState ? 'open' : 'close'}`,
          timestamp: record.timestamp,
          epochTime: new Date(record.timestamp).getTime(),
          timeLabel: new Date(record.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          bagId: record.bagId,
          bagName: record.bagId,
          bagOrder: bagOrderMap.get(record.bagId) ?? 0,
          route: record.route,
          routeName: record.routeName ?? null,
          riderId: record.riderId ?? null,
          riderName: record.riderName ?? null,
          deliveryId: record.deliveryId ?? null,
          eventType: currentState ? 'Open' : 'Close',
          deliveryPhase: record.deliveryPhase,
          deliveryStatus: normalizeDeliveryStatus(record),
          isUnexpected: currentState && record.deliveryPhase === 'Transit',
        } satisfies BagLidEventPoint,
      ]
    })
}

export const buildLeakTrendData = (records: SensorRecord[], selectedHours?: number): LeakTrendPoint[] => {
  if (records.length === 0) {
    return []
  }

  const shouldBucketTenMinutes = selectedHours === 1
  if (shouldBucketTenMinutes) {
    const bucketMs = 10 * 60 * 1000
    const groupedByBucket = new Map<
      number,
      {
        incidentCount: number
        impactedBagIds: Set<string>
      }
    >()

    records.forEach((record) => {
      const timestampMs = new Date(record.timestamp).getTime()
      if (!Number.isFinite(timestampMs)) return
      const bucketStart = Math.floor(timestampMs / bucketMs) * bucketMs

      const existing =
        groupedByBucket.get(bucketStart) ?? {
          incidentCount: 0,
          impactedBagIds: new Set<string>(),
        }

      if (record.leakDetected) {
        existing.incidentCount += 1
        existing.impactedBagIds.add(record.bagId)
      }

      groupedByBucket.set(bucketStart, existing)
    })

    return Array.from(groupedByBucket.entries())
      .sort(([first], [second]) => first - second)
      .map(([bucketStart, grouped]) => ({
        time: new Date(bucketStart).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        incidentCount: grouped.incidentCount,
        impactedBagCount: grouped.impactedBagIds.size,
      }))
  }

  const groupedByTime = new Map<
    string,
    {
      incidentCount: number
      impactedBagIds: Set<string>
    }
  >()

  records.forEach((record) => {
    if (!record.leakDetected) {
      return
    }

    const existing =
      groupedByTime.get(record.timestamp) ?? {
        incidentCount: 0,
        impactedBagIds: new Set<string>(),
      }

    existing.incidentCount += 1
    existing.impactedBagIds.add(record.bagId)
    groupedByTime.set(record.timestamp, existing)
  })

  const timestamps = Array.from(new Set(records.map((record) => record.timestamp))).sort(
    (first, second) => new Date(first).getTime() - new Date(second).getTime(),
  )

  return timestamps.map((timestamp) => {
    const grouped = groupedByTime.get(timestamp)

    return {
      time: new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      incidentCount: grouped?.incidentCount ?? 0,
      impactedBagCount: grouped?.impactedBagIds.size ?? 0,
    }
  })
}

export const buildLeakStatusSummary = (records: SensorRecord[]): LeakStatusSummary => {
  if (records.length === 0) {
    return {
      currentStatus: 'SAFE',
      activeIncidentCount: 0,
      recentIncidentCount: 0,
      recentIncidentCountLast12h: 0,
      impactedBags: [],
      latestIncidentAt: null,
      latestIncidentBagId: null,
    }
  }

  const latestByBag = new Map<string, SensorRecord>()

  records.forEach((record) => {
    const existing = latestByBag.get(record.bagId)
    if (!existing || new Date(record.timestamp) > new Date(existing.timestamp)) {
      latestByBag.set(record.bagId, record)
    }
  })

  const activeLeakRecords = Array.from(latestByBag.values()).filter((record) => record.leakDetected)
  const recentLeakRecords = records.filter((record) => record.leakDetected)
  const latestIncident = recentLeakRecords
    .slice()
    .sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime())[0]

  const latestTimestamp = new Date(records[records.length - 1].timestamp).getTime()
  const last12HourCutoff = latestTimestamp - 12 * 60 * 60 * 1000
  const recentIncidentCountLast12h = recentLeakRecords.filter(
    (record) => new Date(record.timestamp).getTime() >= last12HourCutoff,
  ).length

  const impactedBags = Array.from(new Set(recentLeakRecords.map((record) => record.bagId)))

  return {
    currentStatus: activeLeakRecords.length > 0 ? 'LEAK DETECTED' : 'SAFE',
    activeIncidentCount: activeLeakRecords.length,
    recentIncidentCount: recentLeakRecords.length,
    recentIncidentCountLast12h,
    impactedBags,
    latestIncidentAt: latestIncident?.timestamp ?? null,
    latestIncidentBagId: latestIncident?.bagId ?? null,
  }
}

export const buildLeakDistributionByBag = (records: SensorRecord[]): LeakBagDistributionItem[] => {
  if (records.length === 0) {
    return []
  }

  const leakCounts = new Map<string, number>()

  records.forEach((record) => {
    if (!record.leakDetected) {
      return
    }

    leakCounts.set(record.bagId, (leakCounts.get(record.bagId) ?? 0) + 1)
  })

  return Array.from(leakCounts.entries())
    .map(([bagId, leakCount]) => ({ bagId, leakCount }))
    .sort((first, second) => second.leakCount - first.leakCount || first.bagId.localeCompare(second.bagId))
}

export const buildAlertItems = (records: SensorRecord[], limit = 12): AlertItem[] => {
  return records
    .filter(isAnomalousRecord)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)
    .map((record) => {
      const severity = getAlertSeverity(record)
      const issueType = getRecordIssues(record)[0] ?? 'General anomaly'

      return {
        id: record.id,
        timestamp: record.timestamp,
        time: formatTime(record.timestamp),
        bagId: record.bagId,
        route: record.route,
        issue: issueType,
        severity,
        status: getAlertStatus(severity),
      }
    })
}

export interface TiltKpiMetrics {
  safePercentage: number
  warningPercentage: number
  unsafePercentage: number
  alertCount: number
  totalRecords: number
}

const TILT_WARNING_THRESHOLD = 20
const TILT_UNSAFE_THRESHOLD = 30

export const buildTiltKpiMetrics = (records: SensorRecord[]): TiltKpiMetrics => {
  if (records.length === 0) {
    return {
      safePercentage: 0,
      warningPercentage: 0,
      unsafePercentage: 0,
      alertCount: 0,
      totalRecords: 0,
    }
  }

  let safeCount = 0
  let warningCount = 0
  let unsafeCount = 0
  let alertCount = 0

  records.forEach((record) => {
    if (record.tiltDeg < TILT_WARNING_THRESHOLD) {
      safeCount += 1
    } else if (record.tiltDeg < TILT_UNSAFE_THRESHOLD) {
      warningCount += 1
      alertCount += 1
    } else {
      unsafeCount += 1
      alertCount += 1
    }
  })

  return {
    safePercentage: (safeCount / records.length) * 100,
    warningPercentage: (warningCount / records.length) * 100,
    unsafePercentage: (unsafeCount / records.length) * 100,
    alertCount,
    totalRecords: records.length,
  }
}
