const DEFAULT_API_PORT = "5000"
const API_OVERRIDE_STORAGE_KEY = "TAKECARE_API_BASE_URL"

function resolveLegacyLocalApiOrigin() {
  if (typeof window === "undefined") {
    return `http://127.0.0.1:${DEFAULT_API_PORT}`
  }

  const protocol = window.location?.protocol || "http:"
  const hostname = window.location?.hostname || "127.0.0.1"
  return `${protocol}//${hostname}:${DEFAULT_API_PORT}`
}

const LOCAL_API_ORIGIN = resolveLegacyLocalApiOrigin()

function normalizeBaseUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
}

function getRuntimeApiOverride() {
  if (typeof window === "undefined") return ""

  try {
    const params = new URLSearchParams(window.location.search)
    const queryOverride = normalizeBaseUrl(params.get("apiBaseUrl"))
    if (queryOverride) {
      window.localStorage.setItem(API_OVERRIDE_STORAGE_KEY, queryOverride)
      return queryOverride
    }

    return normalizeBaseUrl(
      window.localStorage.getItem(API_OVERRIDE_STORAGE_KEY)
    )
  } catch {
    return ""
  }
}

export const API_BASE_URL = normalizeBaseUrl(
  getRuntimeApiOverride() ||
    import.meta.env.VITE_API_BASE_URL ||
    LOCAL_API_ORIGIN
)

export const GOOGLE_AUTH_URL = `${API_BASE_URL}/auth/google`

function rewriteApiUrl(inputUrl) {
  if (!inputUrl.startsWith(LOCAL_API_ORIGIN)) return inputUrl
  return `${API_BASE_URL}${inputUrl.slice(LOCAL_API_ORIGIN.length)}`
}

export function installFetchApiBasePatch() {
  if (typeof window === "undefined") return
  if (window.__TAKECARE_FETCH_PATCHED__) return

  const originalFetch = window.fetch.bind(window)

  window.fetch = (input, init) => {
    if (typeof input === "string" || input instanceof URL) {
      return originalFetch(rewriteApiUrl(String(input)), init)
    }

    if (input instanceof Request) {
      const rewrittenUrl = rewriteApiUrl(input.url)
      if (rewrittenUrl !== input.url) {
        return originalFetch(new Request(rewrittenUrl, input), init)
      }
    }

    return originalFetch(input, init)
  }

  window.__TAKECARE_FETCH_PATCHED__ = true
}
