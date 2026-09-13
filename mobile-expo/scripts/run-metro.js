const Module = require("module")
const path = require("path")

const lib = path.join(
  process.env.HOME,
  "Library/Application Support/TakeCare/mobile-expo-deps/node_modules"
)
const orig = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (options && Array.isArray(options.paths) && options.paths.length) {
    return orig.call(this, request, parent, isMain, options)
  }
  if (typeof request === "string" && !request.startsWith(".") && !path.isAbsolute(request)) {
    try {
      return orig.call(this, request, parent, isMain, { paths: [lib] })
    } catch (_) {
      /* fall through */
    }
  }
  return orig.call(this, request, parent, isMain, options)
}

process.env.PATH = `/tmp/nowatch:${process.env.PATH || ""}`
process.chdir(path.resolve(__dirname, ".."))
process.argv = [
  process.argv[0],
  "metro",
  "start",
  "--port",
  "8081",
  "--host",
  "0.0.0.0",
]
require(path.join(lib, "metro/src/cli.js"))
