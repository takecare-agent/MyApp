import { useMemo, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "")
}

function normalizeRoutePath(value) {
  const input = String(value || "").trim()
  if (!input) return "/"
  return input.startsWith("/") ? input : `/${input}`
}

function buildWebUrl(baseUrl, routePath, apiBaseUrl) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl)
  const normalizedRoutePath = normalizeRoutePath(routePath)
  const normalizedApiBaseUrl = trimTrailingSlash(apiBaseUrl)
  if (!normalizedBaseUrl) return ""
  if (!normalizedApiBaseUrl) return `${normalizedBaseUrl}${normalizedRoutePath}`

  const joiner = normalizedRoutePath.includes("?") ? "&" : "?"
  return `${normalizedBaseUrl}${normalizedRoutePath}${joiner}apiBaseUrl=${encodeURIComponent(
    normalizedApiBaseUrl
  )}`
}

function getWebLoadErrorMessage(targetUrl, description) {
  const fallback = description || "Web page failed to load."

  try {
    const parsedUrl = new URL(targetUrl)
    const port = parsedUrl.port || (parsedUrl.protocol === "https:" ? "443" : "80")

    if (fallback.includes("ERR_CONNECTION_REFUSED")) {
      return `No web server is listening at ${parsedUrl.hostname}:${port}. Start the frontend with npm run dev in ../frontend, then reload this page.`
    }

    if (fallback.includes("ERR_CLEARTEXT_NOT_PERMITTED")) {
      return "Android blocked this HTTP URL. Check AndroidManifest cleartext settings."
    }
  } catch {
    return fallback
  }

  return fallback
}

export default function WebAppScreen({
  token,
  role,
  apiBaseUrl,
  webBaseUrl,
  routePath,
  routeTitle,
  onBack,
  onLogout
}) {
  const webRef = useRef(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [error, setError] = useState("")

  const targetUrl = useMemo(
    () => buildWebUrl(webBaseUrl, routePath, apiBaseUrl),
    [apiBaseUrl, routePath, webBaseUrl]
  )

  const injectedAuthScript = useMemo(
    () => `
      (function () {
        try {
          var token = ${JSON.stringify(token || "")};
          var role = ${JSON.stringify(role || "")};
          var apiBaseUrl = ${JSON.stringify(trimTrailingSlash(apiBaseUrl) || "")};
          if (token) {
            localStorage.setItem("token", token);
          } else {
            localStorage.removeItem("token");
          }
          if (role) {
            localStorage.setItem("role", role);
          } else {
            localStorage.removeItem("role");
          }
          if (apiBaseUrl) {
            localStorage.setItem("TAKECARE_API_BASE_URL", apiBaseUrl);
          } else {
            localStorage.removeItem("TAKECARE_API_BASE_URL");
          }
          localStorage.setItem("mobile_mode", "react-native-cli");
        } catch (e) {}
      })();
      true;
    `,
    [apiBaseUrl, role, token]
  )

  const reloadWebView = () => {
    webRef.current?.reload()
  }

  if (!targetUrl) {
    return (
      <View style={styles.stateContainer}>
        <Text style={styles.stateTitle}>Missing Web Base URL</Text>
        <Text style={styles.stateDesc}>
          Set a valid web URL (for example: http://LAN-IP:5173) and login again.
        </Text>
        <Pressable style={styles.ghostBtn} onPress={onBack}>
          <Text style={styles.ghostBtnText}>Back</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <Text style={styles.toolbarTitle}>{routeTitle || "Web Module"}</Text>
          <Text style={styles.toolbarUrl} numberOfLines={1}>
            {targetUrl}
          </Text>
        </View>
        <View style={styles.toolbarActions}>
          <Pressable style={styles.smallBtn} onPress={onBack}>
            <Text style={styles.smallBtnText}>Home</Text>
          </Pressable>
          <Pressable
            style={styles.smallBtn}
            onPress={() => {
              if (canGoBack) {
                webRef.current?.goBack()
              }
            }}
          >
            <Text style={styles.smallBtnText}>Web Back</Text>
          </Pressable>
          <Pressable style={styles.smallBtn} onPress={reloadWebView}>
            <Text style={styles.smallBtnText}>Reload</Text>
          </Pressable>
          <Pressable style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            {getWebLoadErrorMessage(targetUrl, error)}
          </Text>
        </View>
      ) : null}

      <WebView
        ref={webRef}
        source={{ uri: targetUrl }}
        javaScriptEnabled
        domStorageEnabled
        allowsBackForwardNavigationGestures
        originWhitelist={["*"]}
        injectedJavaScriptBeforeContentLoaded={injectedAuthScript}
        injectedJavaScript={injectedAuthScript}
        onLoadStart={() => setError("")}
        onNavigationStateChange={navState => {
          setCanGoBack(navState.canGoBack)
        }}
        onError={event => {
          const description =
            event.nativeEvent?.description || "Web page failed to load."
          setError(description)
        }}
        onHttpError={event => {
          setError(`HTTP ${event.nativeEvent?.statusCode} when loading web page.`)
        }}
        renderError={() => (
          <View style={styles.webErrorContainer}>
            <Text style={styles.webErrorTitle}>Web frontend is not reachable</Text>
            <Text style={styles.webErrorText}>
              {getWebLoadErrorMessage(targetUrl, error)}
            </Text>
            <Text style={styles.webErrorUrl} numberOfLines={3}>
              {targetUrl}
            </Text>
            <View style={styles.webErrorActions}>
              <Pressable style={styles.smallBtn} onPress={onBack}>
                <Text style={styles.smallBtnText}>Home</Text>
              </Pressable>
              <Pressable
                style={styles.smallBtn}
                onPress={reloadWebView}
              >
                <Text style={styles.smallBtnText}>Reload</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2f7ff"
  },
  toolbar: {
    borderBottomWidth: 1,
    borderBottomColor: "#d8e6ff",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8
  },
  toolbarLeft: {
    marginBottom: 8
  },
  toolbarTitle: {
    color: "#173e67",
    fontWeight: "700",
    fontSize: 16
  },
  toolbarUrl: {
    color: "#6a7e99",
    fontSize: 11,
    marginTop: 2
  },
  toolbarActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  smallBtn: {
    borderWidth: 1,
    borderColor: "#c7d8ed",
    backgroundColor: "#f8fbff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  smallBtnText: {
    color: "#1f507f",
    fontWeight: "700",
    fontSize: 12
  },
  logoutBtn: {
    borderWidth: 1,
    borderColor: "#f2c2c2",
    backgroundColor: "#fff5f5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  logoutBtnText: {
    color: "#b42318",
    fontWeight: "700",
    fontSize: 12
  },
  stateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f2f7ff"
  },
  stateTitle: {
    fontSize: 20,
    color: "#173e67",
    fontWeight: "700"
  },
  stateDesc: {
    marginTop: 8,
    color: "#4f6682",
    textAlign: "center"
  },
  ghostBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#c7d8ed",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 18
  },
  ghostBtnText: {
    color: "#1f507f",
    fontWeight: "700"
  },
  errorBanner: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff1f1",
    borderBottomWidth: 1,
    borderBottomColor: "#f4c7c7"
  },
  errorText: {
    color: "#b42318",
    fontSize: 12
  },
  webErrorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f2f7ff"
  },
  webErrorTitle: {
    color: "#173e67",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center"
  },
  webErrorText: {
    marginTop: 10,
    color: "#4f6682",
    lineHeight: 20,
    textAlign: "center"
  },
  webErrorUrl: {
    marginTop: 10,
    color: "#6a7e99",
    fontSize: 12,
    textAlign: "center"
  },
  webErrorActions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8
  }
})
