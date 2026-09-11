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
import { NeoIcon } from "../screens/new_ui/NeoIcons"

const COUNTDOWN_SEC = 10
const PRESET_ICONS = {
  needHelp: "sos-help",
  fell: "sos-fell",
  comeQuick: "sos-run"
}

function SosCountdownRing({ seconds, total, secLabel }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0
  const deg = Math.round(pct * 360)
  const spin = -90 + pct * 360
  return (
    <View style={styles.ringWrap}>
      <View style={styles.ringHalo} />
      <View style={styles.ringTrack} />
      <View
        style={[
          styles.ringSweep,
          {
            experimental_backgroundImage: `conic-gradient(from -90deg, #FF3B3B ${deg}deg, #2A2D32 0deg)`
          }
        ]}
      />
      <View style={[styles.ringGlow, { transform: [{ rotate: `${spin}deg` }] }]} />
      <View style={styles.ringCore} />
      <View style={styles.ringCenter}>
        <Text style={styles.ringNum}>{seconds}</Text>
        <Text style={styles.ringSec}>{secLabel}</Text>
      </View>
    </View>
  )
}

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

  const startCountdown = () => {
    clearTimer()
    setPhase("countdown")
    setSeconds(COUNTDOWN_SEC)
    setError("")
    sendingRef.current = false
    dispatchedRef.current = false
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
    startCountdown()
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
    startCountdown()
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
              <SosCountdownRing
                seconds={seconds}
                total={COUNTDOWN_SEC}
                secLabel={t("sos.sec")}
              />
              <View style={styles.presetCol}>
                {presets.map((preset) => (
                  <Pressable
                    key={preset.key}
                    style={styles.presetBtn}
                    onPress={() => handlePreset(preset)}
                    accessibilityRole="button"
                    accessibilityLabel={preset.text}
                  >
                    <NeoIcon name={PRESET_ICONS[preset.key]} size={36} tint={false} />
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
            <View style={styles.centerBlock}>
              <ActivityIndicator color="#FF4D4D" style={{ marginVertical: 28 }} />
            </View>
          ) : null}

          {showSent ? (
            <View style={styles.centerBlock}>
              <Text style={styles.title}>{t("sos.sent")}</Text>
              <Pressable style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>{t("sos.close")}</Text>
              </Pressable>
            </View>
          ) : null}

          {showError ? (
            <View style={styles.centerBlock}>
              <Text style={styles.title}>{t("sos.sendFail")}</Text>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Pressable style={styles.primaryBtn} onPress={handleRetry}>
                <Text style={styles.primaryBtnText}>{t("sos.retry")}</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelBtnText}>{t("sos.close")}</Text>
              </Pressable>
            </View>
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
    backgroundColor: "rgba(48, 8, 12, 0.62)",
    padding: 22
  },
  panel: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#16181D",
    borderRadius: 28,
    borderCurve: "continuous",
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  centerBlock: {
    gap: 12,
    paddingVertical: 8
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center"
  },
  ringWrap: {
    alignSelf: "center",
    width: 128,
    height: 128,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6
  },
  ringHalo: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(255, 61, 61, 0.08)"
  },
  ringSweep: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56
  },
  ringTrack: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 8,
    borderColor: "#2A2D32"
  },
  ringGlow: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 8,
    borderColor: "transparent",
    borderTopColor: "#FF3B3B",
    borderRightColor: "rgba(255, 77, 77, 0.55)",
    boxShadow: "0 0 18px rgba(255, 59, 59, 0.7)"
  },
  ringCore: {
    position: "absolute",
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#16181D"
  },
  ringCenter: { alignItems: "center" },
  ringNum: {
    fontSize: 42,
    fontWeight: "800",
    color: "#FF4D4D",
    lineHeight: 46
  },
  ringSec: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FF4D4D",
    marginTop: -2
  },
  presetCol: { gap: 10 },
  presetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#12141A",
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 12
  },
  presetBtnText: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF"
  },
  cancelBtn: {
    backgroundColor: "#12141A",
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 2
  },
  cancelBtnText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700"
  },
  primaryBtn: {
    backgroundColor: "#FF3B3B",
    borderRadius: 18,
    borderCurve: "continuous",
    paddingVertical: 14,
    alignItems: "center"
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700"
  },
  errorText: {
    color: "#FF8A8A",
    textAlign: "center",
    fontSize: 14
  }
})
