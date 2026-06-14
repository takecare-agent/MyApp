const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

function normalizePath(value) {
  return String(value || "").replace(/^"|"$/g, "")
}

function javaExecutable(javaHome) {
  return path.join(
    javaHome,
    "bin",
    process.platform === "win32" ? "java.exe" : "java"
  )
}

function validJavaHome(value) {
  const javaHome = normalizePath(value)
  return javaHome && fs.existsSync(javaExecutable(javaHome)) ? javaHome : ""
}

function findJavaHome() {
  const envJavaHome = validJavaHome(process.env.JAVA_HOME)
  if (envJavaHome) return envJavaHome

  if (process.platform !== "win32") return ""

  const candidates = [
    "C:\\Program Files\\Java\\jdk-17",
    "C:\\Program Files\\Java\\jdk-21",
    "C:\\Program Files\\Android\\Android Studio\\jbr"
  ]

  return candidates.find(validJavaHome) || ""
}

const env = { ...process.env }
const javaHome = findJavaHome()

if (javaHome) {
  env.JAVA_HOME = javaHome
}

const cliPath = require.resolve("react-native/cli.js")
const result = spawnSync(
  process.execPath,
  [cliPath, "run-android", ...process.argv.slice(2)],
  {
    env,
    stdio: "inherit"
  }
)

process.exit(result.status === null ? 1 : result.status)
