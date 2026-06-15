function hasReactNativeBridge() {
  return Boolean(window.ReactNativeWebView?.postMessage)
}

export function postNativeMessage(message) {
  if (!hasReactNativeBridge()) return false

  try {
    window.ReactNativeWebView.postMessage(JSON.stringify(message))
    return true
  } catch {
    return false
  }
}

export function openExternalUrl(url, { sameWindow = false } = {}) {
  if (!url) return false

  if (postNativeMessage({ type: "open-url", url })) {
    return true
  }

  if (sameWindow || url.startsWith("tel:") || url.startsWith("geo:")) {
    window.location.href = url
    return true
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer")
  if (!opened) {
    window.location.href = url
  }

  return true
}

export function callPhone(phone = "119") {
  const normalized = String(phone || "119").replace(/[^\d+*#]/g, "")
  return openExternalUrl(`tel:${normalized || "119"}`, { sameWindow: true })
}

export function openMapLocation({ latitude, longitude, locationLabel } = {}) {
  const lat = Number(latitude)
  const lng = Number(longitude)
  const query = Number.isFinite(lat) && Number.isFinite(lng)
    ? `${lat},${lng}`
    : String(locationLabel || "").trim()

  if (!query) return false

  return openExternalUrl(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  )
}

export function getCurrentLocation({ timeout = 8000 } = {}) {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        resolve({
          latitude,
          longitude,
          locationLabel: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        })
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout,
        maximumAge: 30000
      }
    )
  })
}
