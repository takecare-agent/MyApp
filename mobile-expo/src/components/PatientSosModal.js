import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native"
import { apiRequest } from "../lib/api"
import { useI18n } from "../i18n/I18nContext"

const COUNTDOWN_SEC = 10

/**
 * 長輩首頁 SOS：一按開取消窗。
 * 短語鈕＝立刻送；倒數到 0＝預設訊息送；一律通知照護圈雙方（不傳 audience）。
 */
export default function PatientSosModal({ visible, apiBaseUrl, token, onClose }) {
  const { t, lang } = useI18n()
  const presets = [
    { key: "needHelp", text: t("sos.needHelp") },
    { key: "fell", text: t("sos.fell") },
    { key: "comeQuick", text: t("sos.comeQuick") }
  ]
  const defaultMessage = presets[0].text
  const [phase, setPhase] = useState("idle") // idle | countdown | sending | sent | error
  const [seconds, setSeconds] = useState(COUNTDOWN_SEC)
  const [error, setError] = useState("")
  const timerRef = useRef(null)
  const sendingRef = useRef(false)
  const dispatchedRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const reset = () => {
    clearTimer()
    sendingRef.current = false
    dispatchedRef.current = false
    setPhase("idle")
    setSeconds(COUNTDOWN_SEC)
    setError("")
  }

  const handleClose = () => {
    reset()
    onClose?.()
  }

  const sendSos = async (messageText, messageKey = "") => {
    if (sendingRef.current || dispatchedRef.current) return
    sendingRef.current = true
    dispatchedRef.current = true
    clearTimer()
    setPhase("sending")
    setError("")
    try {
      const message = String(messageText || "").trim() || defaultMessage
      const body = {
        message,
        messageKey: messageKey || undefined,
        sourceLang: lang
      }
      await apiRequest({
        apiBaseUrl,
        path: "/patient/sos/trigger",
        method: "POST",
        token,
        body
      })
      setPhase("sent")
    } catch (err) {
      dispatchedRef.current = false
      setError(err.message || t("sos.sendFailDetail"))
      setPhase("error")
    } finally {
      sendingRef.current = false
    }
  }

  useEffect(() => {
    if (!visible) {
      reset()
      return undefined
    }

    setPhase("countdown")
    setSeconds(COUNTDOWN_SEC)
    setError("")
    sendingRef.current = false

    clearTimer()
    timerRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearTimer()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearTimer()
  }, [visible])

  useEffect(() => {
    if (!visible || phase !== "countdown") return
    if (seconds === 0) {
      sendSos(defaultMessage, "needHelp")
    }
  }, [visible, phase, seconds])

  const handleCancel = () => {
    if (phase === "sending") return
    clearTimer()
    handleClose()
  }

  const handlePreset = (preset) => {
    if (phase !== "countdown") return
    sendSos(preset.text, preset.key)
  }

  const handleRetry = () => {
    setError("")
    setPhase("countdown")
    setSeconds(COUNTDOWN_SEC)
    sendingRef.current = false
    dispatchedRef.current = false
    locationPromiseRef.current = requestLocationPermission(permLabels).then((ok) =>
      ok ? getCurrentPosition(true, permLabels) : null
    )
    clearTimer()
    timerRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearTimer()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const showCountdown = phase === "countdown"
  const showSending = phase === "sending"
  const showSent = phase === "sent"
  const showError = phase === "error"

  return (
    <Modal
      animationType="fade"
      transparent
      visible={Boolean(visible)}
      onRequestClose={phase === "sending" ? undefined : handleCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          {showCountdown ? (
            <>
              <Text style={styles.countdown}>{seconds}</Text>
              <View style={styles.presetRow}>
                {presets.map((preset) => (
                  <Pressable
                    key={preset.key}
                    style={styles.presetBtn}
                    onPress={() => handlePreset(preset)}
                    accessibilityRole="button"
                    accessibilityLabel={preset.text}
                  >
                    <Text style={styles.presetBtnText}>{preset.text}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={styles.cancelBtn}
                onPress={handleCancel}
                accessibilityRole="button"
                accessibilityLabel={t("sos.cancelSos")}
              >
                <Text style={styles.cancelBtnText}>{t("sos.cancel")}</Text>
              </Pressable>
            </>
          ) : null}

          {showSending ? (
            <>
              <ActivityIndicator color="#b91c1c" style={{ marginVertical: 28 }} />
            </>
          ) : null}

          {showSent ? (
            <>
              <Text style={styles.title}>{t("sos.sent")}</Text>
              <Pressable style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>{t("sos.close")}</Text>
              </Pressable>
            </>
          ) : null}

          {showError ? (
            <>
              <Text style={styles.title}>{t("sos.sendFail")}</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.primaryBtn} onPress={handleRetry}>
                <Text style={styles.primaryBtnText}>{t("sos.retry")}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={handleClose}>
                <Text style={styles.secondaryBtnText}>{t("sos.close")}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(127, 29, 29, 0.45)",
    padding: 24
  },
  panel: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 22,
    gap: 10,
    borderCurve: "continuous"
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#7f1d1d",
    textAlign: "center"
  },
  countdown: {
    fontSize: 64,
    fontWeight: "800",
    color: "#b91c1c",
    textAlign: "center",
    marginVertical: 8
  },
  presetRow: {
    gap: 10,
    marginTop: 4
  },
  presetBtn: {
    borderWidth: 2,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: 14,
    borderCurve: "continuous",
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  presetBtnText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#7f1d1d"
  },
  cancelBtn: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    borderCurve: "continuous",
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 6
  },
  cancelBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700"
  },
  primaryBtn: {
    backgroundColor: "#D96B43",
    borderRadius: 20,
    borderCurve: "continuous",
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderCurve: "continuous",
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4
  },
  secondaryBtnText: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "600"
  },
  errorText: {
    color: "#b91c1c",
    textAlign: "center",
    fontSize: 14
  }
})
