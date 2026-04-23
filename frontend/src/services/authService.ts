export interface AuthUser {
  username: string
  role: string
}

export interface LoginResponse {
  token: string
  user: AuthUser
  expiresIn: string
}

const TOKEN_STORAGE_KEY = 'token'

export const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export const setStoredToken = (token: string) => {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export const clearStoredToken = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

const createHttpError = (status: number, message: string) => {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = typeof payload.error === 'string' ? payload.error : 'Login failed'
    throw createHttpError(response.status, message)
  }

  return response.json()
}

export async function verifyToken(token: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/verify', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = typeof payload.error === 'string' ? payload.error : 'Token verification failed'
    throw createHttpError(response.status, message)
  }

  const payload = await response.json()
  return payload.user as AuthUser
}
