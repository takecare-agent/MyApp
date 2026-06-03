function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "")
}

export async function apiRequest({
  apiBaseUrl,
  path,
  method = "GET",
  token,
  body
}) {
  const base = trimTrailingSlash(apiBaseUrl)
  const url = `${base}${path}`

  const headers = {}
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  const raw = await response.text()
  let data = {}
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = { message: raw }
    }
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`)
  }

  return data
}

export function mobileDevLogin({ apiBaseUrl, email, name, role }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/dev-login",
    method: "POST",
    body: { email, name, role }
  })
}
