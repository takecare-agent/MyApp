function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "")
}

export class ApiError extends Error {
  constructor(message, { status, data, path } = {}) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.data = data || {}
    this.path = path
  }
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
    throw new ApiError(toReadableApiError({ status: response.status, path, raw, data }), {
      status: response.status,
      data,
      path
    })
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

export function mobileRegister({ apiBaseUrl, email, name, password, lang }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/register",
    method: "POST",
    body: { email, name, password, lang: lang || "zh" }
  })
}

export function mobileLogin({ apiBaseUrl, email, password, lang }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/login",
    method: "POST",
    body: { email, password, ...(lang ? { lang } : {}) }
  })
}

export function mobileVerifyEmail({ apiBaseUrl, email, code }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/verify-email",
    method: "POST",
    body: { email, code }
  })
}

export function mobileResendVerify({ apiBaseUrl, email }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/resend-verify",
    method: "POST",
    body: { email }
  })
}

export function mobileCompleteProfile({
  apiBaseUrl,
  token,
  role,
  linkedPatientEmail,
  inviteCode,
  name
}) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/complete-profile",
    method: "POST",
    token,
    body: { role, linkedPatientEmail, inviteCode, name }
  })
}

export function mobileCareCircle({ apiBaseUrl, token }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/care-circle",
    method: "GET",
    token
  })
}

/** 別名：看護／家屬列出已加入的照護圈 */
export function mobileCareCircleList({ apiBaseUrl, token }) {
  return mobileCareCircle({ apiBaseUrl, token })
}

/** 跨所有照護圈的 active SOS inbox（看護／家屬） */
export function mobileSosInbox({ apiBaseUrl, token }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/sos/inbox",
    method: "GET",
    token
  })
}

/** 看護立即處理 SOS */
export function caregiverSosClaim({ apiBaseUrl, token, id }) {
  return apiRequest({
    apiBaseUrl,
    path: `/caregiver/sos/${encodeURIComponent(id)}/claim`,
    method: "POST",
    token,
    body: {}
  })
}

/** 看護標記 SOS 已處理（結案） */
export function caregiverSosResolve({ apiBaseUrl, token, id, resolutionNote = "" }) {
  return apiRequest({
    apiBaseUrl,
    path: `/caregiver/sos/${encodeURIComponent(id)}/resolve`,
    method: "PATCH",
    token,
    body: resolutionNote ? { resolutionNote } : {}
  })
}

/** 家屬提醒看護（知情催促，非接手） */
export function familySosRemind({ apiBaseUrl, token, id }) {
  return apiRequest({
    apiBaseUrl,
    path: `/family/sos/${encodeURIComponent(id)}/remind`,
    method: "POST",
    token,
    body: {}
  })
}

export function patientGetHealthCard({ apiBaseUrl, token }) {
  return apiRequest({
    apiBaseUrl,
    path: "/patient/health-card",
    method: "GET",
    token
  })
}

export function patientPatchHealthCard({ apiBaseUrl, token, healthCard }) {
  return apiRequest({
    apiBaseUrl,
    path: "/patient/health-card",
    method: "PATCH",
    token,
    body: healthCard || {}
  })
}

export function mobileGetHealthCard({ apiBaseUrl, token, patientEmail }) {
  const q = encodeURIComponent(String(patientEmail || "").trim())
  return apiRequest({
    apiBaseUrl,
    path: `/mobile/health-card?patientEmail=${q}`,
    method: "GET",
    token
  })
}

export function mobileCareCircleRotateInvite({ apiBaseUrl, token }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/care-circle/invite/rotate",
    method: "POST",
    token,
    body: {}
  })
}

export function mobileCareCircleBind({ apiBaseUrl, token, linkedPatientEmail, inviteCode }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/care-circle/bind",
    method: "POST",
    token,
    body: { linkedPatientEmail, inviteCode }
  })
}

export function mobileCareCircleRemoveMember({ apiBaseUrl, token, memberEmail }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/care-circle/remove-member",
    method: "POST",
    token,
    body: { memberEmail }
  })
}

export function mobileCareCircleDissolve({ apiBaseUrl, token }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/care-circle/dissolve",
    method: "POST",
    token,
    body: {}
  })
}

export function mobileCareCircleSwitch({ apiBaseUrl, token, patientEmail }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/care-circle/switch",
    method: "POST",
    token,
    body: { patientEmail }
  })
}

export function mobileCareCircleLeave({ apiBaseUrl, token, patientEmail }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/care-circle/leave",
    method: "POST",
    token,
    body: patientEmail ? { patientEmail } : {}
  })
}

export function mobileCareCircleResetIdentity({ apiBaseUrl, token }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/care-circle/reset-identity",
    method: "POST",
    token,
    body: {}
  })
}

export function mobileMe({ apiBaseUrl, token }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/me",
    method: "GET",
    token
  })
}

/** @deprecated  SOS 固定通知照護圈雙方；保留呼叫相容 */
export function patientSetSosAudience({ apiBaseUrl, token, sosAudience }) {
  return apiRequest({
    apiBaseUrl,
    path: "/patient/sos-audience",
    method: "PATCH",
    token,
    body: { sosAudience: sosAudience || "circle" }
  })
}

export function mobileAuthConfig({ apiBaseUrl }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/auth/config",
    method: "GET"
  })
}

export function mobileAuthGoogle({ apiBaseUrl, idToken }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/auth/google",
    method: "POST",
    body: { idToken }
  })
}

export function mobileAuthApple({ apiBaseUrl, identityToken, fullName }) {
  return apiRequest({
    apiBaseUrl,
    path: "/mobile/auth/apple",
    method: "POST",
    body: { identityToken, fullName }
  })
}

export const TEST_ACCOUNT_PASSWORD = "Test1234!"
