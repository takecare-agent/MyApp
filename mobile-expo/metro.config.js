const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config")
const path = require("path")

const empty = path.resolve(__dirname, "shims/empty.js")

const config = {
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
