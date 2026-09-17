const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config")
const http = require("http")
const path = require("path")

const API_PROXY_PREFIX = "/__takecare_api"

function shouldProxyToBackend(url) {
  const pathOnly = String(url || "").split("?")[0]
  return (
    pathOnly === API_PROXY_PREFIX ||
    pathOnly.startsWith(`${API_PROXY_PREFIX}/`) ||
    pathOnly === "/socket.io" ||
    pathOnly.startsWith("/socket.io/")
  )
}

function backendPath(url) {
  const raw = String(url || "/")
  if (raw === API_PROXY_PREFIX || raw.startsWith(`${API_PROXY_PREFIX}/`) || raw.startsWith(`${API_PROXY_PREFIX}?`)) {
    const rest = raw.slice(API_PROXY_PREFIX.length)
    if (!rest) return "/"
    return rest.startsWith("/") || rest.startsWith("?") ? rest : `/${rest}`
  }
  return raw
}

function proxyToBackend(req, res) {
  const headers = { ...req.headers, host: "127.0.0.1:5000" }
  delete headers.connection
  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: 5000,
      path: backendPath(req.url),
      method: req.method,
      headers
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )
  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 502
      res.setHeader("Content-Type", "application/json; charset=utf-8")
      res.end(JSON.stringify({ message: "電腦後端沒開（埠 5000）" }))
      return
    }
    res.destroy()
  })
  req.pipe(proxyReq)
}

try {
  require("./scripts/write-dev-hosts")
} catch (err) {
  console.log("[dev-hosts] skip", err?.message || err)
}

const empty = path.resolve(__dirname, "shims/empty.js")
const polyfillWindow = path.resolve(__dirname, "src/polyfillWindow.js")
// Must match the copy Metro puts in the graph (project node_modules), not Library.
const rnInitializeCore = path.join(
  __dirname,
  "node_modules/react-native/Libraries/Core/InitializeCore.js"
)
const libNm = path.join(
  process.env.HOME || "",
  "Library/Application Support/TakeCare/mobile-expo-deps/node_modules"
)

const config = {
  watchFolders: [libNm],
  server: {
    enhanceMiddleware: (middleware) => (req, res, next) => {
      if (req.url === "/status" || req.url?.startsWith("/status?")) {
        res.setHeader("Content-Type", "text/plain")
        res.end("packager-status:running")
        return
      }
      if (shouldProxyToBackend(req.url)) {
        proxyToBackend(req, res)
        return
      }
      return middleware(req, res, next)
    },
  },
  serializer: {
    getPolyfills: () => {
      let rnPolyfills = []
      try {
        rnPolyfills = require("@react-native/js-polyfills")()
      } catch (_) {
        /* Library copy may be used via watchFolders */
      }
      return [polyfillWindow, ...rnPolyfills]
    },
    getModulesRunBeforeMainModule: () => [polyfillWindow, rnInitializeCore],
  },
  resolver: {
    extraNodeModules: {
      net: empty,
      tls: empty,
      http: empty,
      https: empty,
      stream: empty,
      ws: empty,
    },
  },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
