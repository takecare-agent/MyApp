var g = typeof globalThis !== "undefined" ? globalThis : global
if (g) {
  if (g.window == null) g.window = g
  if (g.self == null) g.self = g
}
