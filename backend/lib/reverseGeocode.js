const https = require("https")

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "TakeCareApp/1.0 (sos reverse-geocode)",
          "Accept-Language": "zh-TW,zh,en",
          Accept: "application/json"
        }
      },
      (res) => {
        let buf = ""
        res.on("data", (chunk) => {
          buf += chunk
        })
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf))
          } catch (err) {
            reject(err)
          }
        })
      }
    )
    req.on("error", reject)
    req.setTimeout(7000, () => {
      req.destroy()
      reject(new Error("reverse geocode timeout"))
    })
  })
}

function formatAddress(data) {
  const display = String(data?.display_name || "").trim()
  if (display) return display
  const a = data?.address || {}
  const parts = [
    a.road || a.pedestrian || a.neighbourhood,
    a.suburb || a.village || a.town,
    a.city_district || a.city || a.county,
    a.state,
    a.country
  ].filter(Boolean)
  return [...new Set(parts)].join(" ").trim()
}

async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ""
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}&format=jsonv2&zoom=18&addressdetails=1`
  const data = await httpsGetJson(url)
  return formatAddress(data)
}

function reverseGeocodeWithTimeout(lat, lng, ms = 2500) {
  return Promise.race([
    reverseGeocode(lat, lng).catch(() => ""),
    new Promise((resolve) => setTimeout(() => resolve(""), ms))
  ])
}

module.exports = { reverseGeocode, reverseGeocodeWithTimeout }
