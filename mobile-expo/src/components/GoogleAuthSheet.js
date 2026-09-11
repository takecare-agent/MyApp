import { useEffect, useRef, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"
import { parseOauthDeepLink } from "../lib/socialAuth"
import { useI18n } from "../i18n/I18nContext"

function tryConsume(url, onToken) {
  const parsed = parseOauthDeepLink(String(url || ""))
  if (parsed?.token) {
    onToken(parsed)
    return true
  }
  return false
}

function tryMessage(raw, onToken) {
  try {
    const data = JSON.parse(String(raw || "{}"))
    if (data?.token) {
      onToken({
        token: data.token,
        needsRole: data.needsRole === true || data.needsRole === "1",
        email: data.email || ""
      })
      return true
    }
  } catch {
    return tryConsume(String(raw || ""), onToken)
  }
  return false
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "")
}

function isLoopbackGoogleCallback(url) {
  try {
    const parsed = new URL(String(url || ""))
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
    return loopback && /\/auth\/google\/callback/i.test(parsed.pathname || "")
  } catch {
    return false
  }
}

/** 手機不能連自己的 localhost；把 Google 回跳的 code 拿到 App，改打 LAN 後端換 token */
async function redeemLoopbackCallback(url, apiBaseUrl, onToken) {
  const parsed = new URL(String(url || ""))
  const base = trimSlash(apiBaseUrl)
  if (!base) return false
  const res = await fetch(`${base}/auth/google/callback${parsed.search || ""}`, {
    headers: {
      Accept: "application/json",
      "X-TakeCare-Mobile": "1"
    }
  })
  const data = await res.json().catch(() => ({}))
  if (!data?.token) return false
  onToken({
    token: data.token,
    needsRole: data.needsRole === true || data.needsRole === "1",
    email: data.email || ""
  })
  return true
}

export default function GoogleAuthSheet({ visible, startUrl, apiBaseUrl, onToken, onClose }) {
  const { t } = useI18n()
  const webRef = useRef(null)
  const redeemingRef = useRef(false)
  const pickingRef = useRef(false)
  const [pageUrl, setPageUrl] = useState(startUrl)
  const [hint, setHint] = useState("")

  useEffect(() => {
    if (visible && startUrl) {
      redeemingRef.current = false
      pickingRef.current = false
      setHint("")
      setPageUrl(startUrl)
    }
  }, [visible, startUrl])

  if (!visible || !startUrl) return null

  const intercept = (url) => {
    if (tryConsume(url, onToken)) return false
    if (url.startsWith("intent://") || url.startsWith("takecare://")) {
      tryConsume(url, onToken)
      return false
    }
    if (!isLoopbackGoogleCallback(url)) return true
    if (redeemingRef.current) return false
    redeemingRef.current = true
    setHint(t("google.completing"))
    redeemLoopbackCallback(url, apiBaseUrl, onToken).catch(() => {
      redeemingRef.current = false
      setHint(t("google.serverFail"))
    })
    return false
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.top}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>{t("google.cancel")}</Text>
          </Pressable>
          <Text style={styles.title}>{t("google.title")}</Text>
          <Pressable
            onPress={() => {
              redeemingRef.current = false
              pickingRef.current = true
              setHint(t("google.pickAccount"))
              setPageUrl("https://accounts.google.com/Logout")
              setTimeout(() => {
                pickingRef.current = false
                const joiner = String(startUrl).includes("?") ? "&" : "?"
                setPageUrl(`${startUrl}${joiner}t=${Date.now()}`)
              }, 1400)
            }}
            hitSlop={12}
          >
            <Text style={styles.other}>{t("google.otherAccount")}</Text>
          </Pressable>
        </View>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        <WebView
          ref={webRef}
          source={{ uri: pageUrl || startUrl }}
          startInLoadingState
          javaScriptEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          onMessage={(e) => {
            tryMessage(e?.nativeEvent?.data, onToken)
          }}
          onShouldStartLoadWithRequest={(req) => intercept(String(req?.url || ""))}
          onNavigationStateChange={(nav) => {
            const url = String(nav?.url || "")
            intercept(url)
            if (
              pickingRef.current &&
              /accounts\.google\.com\/(Logout|logout)/i.test(url) &&
              nav.loading === false
            ) {
              pickingRef.current = false
              const joiner = String(startUrl).includes("?") ? "&" : "?"
              setPageUrl(`${startUrl}${joiner}t=${Date.now()}`)
            }
          }}
          onError={(e) => {
            intercept(String(e?.nativeEvent?.url || ""))
          }}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0B0D0E" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)"
  },
  close: { color: "#10B981", fontWeight: "800", fontSize: 16, width: 48 },
  other: { color: "#10B981", fontWeight: "800", fontSize: 13, minWidth: 72, textAlign: "right" },
  title: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  hint: {
    color: "#A8E6CF",
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 16
  }
})
