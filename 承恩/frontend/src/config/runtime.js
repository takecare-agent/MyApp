const LOCAL_API_ORIGIN = "http://localhost:5000"

function normalizeBaseUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
}

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL || LOCAL_API_ORIGIN
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
