/**
 * apiService.ts
 * Fetches real sensor records from the Express backend.
 * The Vite dev-server proxy forwards /api → http://localhost:3000
 * so no CORS issues arise during development.
 */

import type { RiderOption, RouteOption, SensorRecord } from '../types/dashboard'
import { getStoredToken } from './authService'

const API_BASE = '/api'

const buildAuthHeaders = () => {
  const token = getStoredToken()
  if (!token) {
    return undefined
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

const createHttpError = (status: number, message: string) => {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

export interface FetchOptions {
  /** How many hours of history to load (default 72) */
  hours?: number
  /** Filter to a single bag ID, or 'ALL' for every bag */
  bagId?: string
  /** Hard cap on returned documents (default 5000) */
  limit?: number
}

/**
 * Fetches SensorRecord[] from the backend.
 * Throws if the network request fails so callers can fall back to mock data.
 */
export async function fetchSensorRecords(options: FetchOptions = {}): Promise<SensorRecord[]> {
  const { hours = 72, bagId, limit = 5000 } = options

  const params = new URLSearchParams({ hours: String(hours), limit: String(limit) })
  if (bagId && bagId !== 'ALL') params.set('bagId', bagId)

  const response = await fetch(`${API_BASE}/sensor-records?${params}`, {
    headers: buildAuthHeaders(),
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = typeof payload.error === 'string' ? payload.error : response.statusText
    throw createHttpError(response.status, message)
  }

  const records: SensorRecord[] = await response.json()
  return records
}

/**
 * Fetches distinct bag IDs known by backend storage.
 */
export async function fetchBagOptions(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/bags`, {
    headers: buildAuthHeaders(),
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = typeof payload.error === 'string' ? payload.error : response.statusText
    throw createHttpError(response.status, message)
  }

  const bags: string[] = await response.json()
  return bags
}

export async function fetchRiders(status: 'active' | 'inactive' | 'all' = 'active'): Promise<RiderOption[]> {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)

  const response = await fetch(`${API_BASE}/riders${params.size ? `?${params}` : ''}`, {
    headers: buildAuthHeaders(),
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = typeof payload.error === 'string' ? payload.error : response.statusText
    throw createHttpError(response.status, message)
  }

  return response.json()
}

export async function fetchRoutes(): Promise<RouteOption[]> {
  const response = await fetch(`${API_BASE}/routes`, {
    headers: buildAuthHeaders(),
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = typeof payload.error === 'string' ? payload.error : response.statusText
    throw createHttpError(response.status, message)
  }

  return response.json()
}
