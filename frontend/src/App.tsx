import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/navigation/AppLayout'
import LoginPage from './features/auth/LoginPage'
import AlertsPage from './features/alerts/AlertsPage'
import DashboardPage from './features/dashboard/DashboardPage'
import { clearStoredToken, getStoredToken, type AuthUser, verifyToken } from './services/authService'
import { fetchBagOptions, fetchSensorRecords } from './services/apiService'
import { sensorRecords as mockRecords } from './services/mockData'
import 'leaflet/dist/leaflet.css'
import './styles/dashboard.css'
import type { SensorRecord } from './types/dashboard'

/** Real-time polling interval for dashboard updates */
const API_POLL_INTERVAL_MS = 500
const INITIAL_HISTORY_HOURS = 24
const INITIAL_HISTORY_LIMIT = 3000
const LIVE_HISTORY_HOURS = 2
const LIVE_HISTORY_LIMIT = 600
const SENSOR_CACHE_KEY = 'smartbag_sensor_records_cache_v1'

const loadCachedRecords = (): SensorRecord[] => {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(SENSOR_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SensorRecord[]
  } catch {
    return []
  }
}

const saveCachedRecords = (records: SensorRecord[]) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(SENSOR_CACHE_KEY, JSON.stringify(records.slice(-1000)))
  } catch {
    // ignore cache write failures
  }
}

function App() {
  const [records, setRecords] = useState<SensorRecord[]>(() => loadCachedRecords())
  const [bagOptions, setBagOptions] = useState<string[]>([])
  const [usingMock, setUsingMock] = useState(false)
  const [backendReachable, setBackendReachable] = useState(true)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')

  // Track whether we already loaded real data so polling can do incremental fetches
  const hasRealData = useRef(records.length > 0)

  useEffect(() => {
    let cancelled = false

    async function verifyStoredSession() {
      const token = getStoredToken()
      if (!token) {
        setAuthStatus('unauthenticated')
        return
      }

      try {
        const user = await verifyToken(token)
        if (cancelled) return

        setAuthUser(user)
        setAuthStatus('authenticated')
      } catch {
        if (cancelled) return

        clearStoredToken()
        setAuthUser(null)
        setAuthStatus('unauthenticated')
      }
    }

    verifyStoredSession()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return
    }

    let cancelled = false

    async function loadRecords() {
      try {
        const recordFetchOptions = hasRealData.current
          ? { hours: LIVE_HISTORY_HOURS, limit: LIVE_HISTORY_LIMIT }
          : { hours: INITIAL_HISTORY_HOURS, limit: INITIAL_HISTORY_LIMIT }

        const [real, knownBags] = await Promise.all([
          fetchSensorRecords(recordFetchOptions),
          fetchBagOptions().catch(() => [] as string[]),
        ])

        if (cancelled) return

        if (knownBags.length > 0) {
          setBagOptions(knownBags)
        }

        if (real.length > 0) {
          setRecords(real)
          saveCachedRecords(real)
          hasRealData.current = true
          setUsingMock(false)
          setBackendReachable(true)
        } else {
          // Backend is live but no data yet → use mock so the UI isn't empty
          setBackendReachable(true)
          if (!hasRealData.current) {
            setRecords(mockRecords)
            setUsingMock(true)
          }
        }
      } catch (caughtError) {
        const statusCode =
          caughtError && typeof caughtError === 'object' && 'status' in caughtError
            ? Number((caughtError as { status: unknown }).status)
            : null

        // Token invalid/expired -> force re-login
        if (!cancelled && statusCode === 401 && getStoredToken()) {
          clearStoredToken()
          setAuthUser(null)
          setAuthStatus('unauthenticated')
          return
        }

        // Backend unreachable → fall back to mock data
        if (!hasRealData.current && !cancelled) {
          setRecords(mockRecords)
          setUsingMock(true)
        }

        if (!cancelled) {
          setBackendReachable(false)
        }
      }
    }

    // Initial load
    loadRecords()

    // Poll for new records
    const intervalId = window.setInterval(loadRecords, API_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [authStatus])

  if (authStatus === 'checking') {
    return (
      <main className="dashboard-shell" style={{ maxWidth: 480, margin: '48px auto' }}>
        <section className="panel" style={{ padding: 24 }}>
          Validating session...
        </section>
      </main>
    )
  }

  return (
    <>
      {usingMock && !backendReachable && (
        <div
          style={{
            background: '#f59e0b',
            color: '#1c1917',
            textAlign: 'center',
            padding: '6px',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          ⚠ Backend not reachable – showing simulated data. Start the server on port 3000 to see live data.
        </div>
      )}
      <Routes>
        <Route
          path="/login"
          element={
            authStatus === 'authenticated' && authUser ? (
              <Navigate to="/overview" replace />
            ) : (
              <LoginPage
                onLoginSuccess={(user) => {
                  setAuthUser(user)
                  setAuthStatus('authenticated')
                }}
              />
            )
          }
        />

        <Route element={authStatus === 'authenticated' ? <AppLayout records={records} /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<DashboardPage records={records} availableBagIds={bagOptions} />} />
          <Route path="/alerts" element={<AlertsPage records={records} />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
