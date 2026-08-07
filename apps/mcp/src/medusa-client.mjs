const DEFAULT_TIMEOUT_MS = 20000

function compactObject(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""))
}

export function buildQuery(query = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(compactObject(query))) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item))
    } else if (typeof value === "object") {
      params.set(key, JSON.stringify(value))
    } else {
      params.set(key, String(value))
    }
  }
  const text = params.toString()
  return text ? `?${text}` : ""
}

export class MedusaClient {
  constructor(env = process.env) {
    this.baseUrl = (env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
    this.publishableKey = env.MEDUSA_PUBLISHABLE_KEY || ""
    this.storeToken = env.MEDUSA_STORE_TOKEN || ""
    this.adminToken = env.MEDUSA_ADMIN_TOKEN || ""
    this.timeoutMs = Number(env.MEDUSA_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  }

  async request({ method = "GET", path, scope = "store", query, body }) {
    const url = `${this.baseUrl}${path}${buildQuery(query)}`
    const headers = { accept: "application/json" }
    if (body !== undefined) headers["content-type"] = "application/json"

    if (scope === "store") {
      if (this.publishableKey) headers["x-publishable-api-key"] = this.publishableKey
      if (this.storeToken) headers.authorization = `Bearer ${this.storeToken}`
    } else if (scope === "admin") {
      if (this.adminToken) headers.authorization = `Bearer ${this.adminToken}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })

      const text = await response.text()
      let payload = null
      if (text) {
        try { payload = JSON.parse(text) } catch { payload = { text } }
      }

      if (!response.ok) {
        const err = new Error(`Medusa ${method} ${path} failed with HTTP ${response.status}`)
        err.status = response.status
        err.payload = payload
        throw err
      }

      return payload ?? { ok: true, status: response.status }
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Medusa request timed out after ${this.timeoutMs} ms: ${method} ${path}`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
