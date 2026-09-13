const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config")
const path = require("path")

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
