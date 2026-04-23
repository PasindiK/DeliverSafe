import { getStoredToken } from './authService'

interface ChatRequestPayload {
  message: string
  dashboardState?: {
    path?: string
    bagId?: string
    hours?: number
    route?: string
    anomaliesOnly?: boolean
    chartContext?: unknown
  }
}

interface ChatResponsePayload {
  answer: string
}

const createHttpError = (status: number, message: string) => {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

export async function askVirtualAssistant(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
  const token = getStoredToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}))
    const message = typeof errorPayload.error === 'string' ? errorPayload.error : 'Assistant request failed'
    throw createHttpError(response.status, message)
  }

  return response.json()
}
