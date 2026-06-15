function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "")
}

function toReadableApiError({ status, path, raw, data }) {
  const message = data?.message || ""
  const looksLikeHtml =
    typeof raw === "string" && /^\s*<!doctype html|^\s*<html[\s>]/i.test(raw)

  if (looksLikeHtml) {
    return `API route not found or API Base URL is wrong (${status} ${path})`
  }

  return message || `Request failed (${status})`
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
    throw new Error(toReadableApiError({ status: response.status, path, raw, data }))
  }

  return data
}

export function mobileDevLogin({ apiBaseUrl, email, name, role, linkedPatientEmail }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/dev-login",
    method: "POST",
    body: { email, name, role, linkedPatientEmail }
  })
}
