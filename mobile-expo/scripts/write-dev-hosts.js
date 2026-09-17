const fs = require("fs")
const os = require("os")
const path = require("path")

const TUNNEL_FILE = "/tmp/takecare-dev-tunnel.txt"
const OUT = path.join(__dirname, "../src/lib/devHosts.generated.js")

function ipv4s() {
  const usb = []
  const wifi = []
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs || []) {
      const family = String(addr.family)
      if ((family !== "IPv4" && family !== "4") || addr.internal) continue
      if (addr.address.startsWith("169.254.")) usb.push(addr.address)
      else wifi.push(addr.address)
    }
  }
  return { usb: usb[0] || "", wifi: wifi[0] || "" }
}

function tunnelUrl() {
  try {
    return String(fs.readFileSync(TUNNEL_FILE, "utf8") || "").trim()
  } catch {
    return ""
  }
}

const { usb, wifi } = ipv4s()
const tunnel = process.env.TAKECARE_DEV_TUNNEL || tunnelUrl()
const body = `export const usb = ${JSON.stringify(usb)}
export const wifi = ${JSON.stringify(wifi)}
export const tunnel = ${JSON.stringify(tunnel)}
`
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, body)
console.log(`[dev-hosts] usb=${usb || "-"} wifi=${wifi || "-"} tunnel=${tunnel || "-"}`)
