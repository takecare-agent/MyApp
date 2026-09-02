import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { useI18n } from "../i18n/I18nContext"
import TranslatedUgcText from "./TranslatedUgcText"

function formatSosTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(undefined, { hour12: false })
}

/**
 * 照護圈緊急卡（當下事件，不是歷程）：
 * 看護＝119 → 已處理；家屬＝119 → 提醒看護 → 關閉。可看健康資訊。
 * 居家產品不做即時 GPS／地圖。
 */
export default function GlobalEmergencyModal({
  visible,
  record,
  role,
  busy,
  actionMsg,
  actionMsgKey,
  apiBaseUrl,
  token,
  onResolve,
  onRemind,
  onOpen119,
  onOpenHealth,
  onDismiss
}) {
  const { t } = useI18n()
  if (!visible || !record) return null

  const status = record.status
  const isCaregiver = role === "caregiver"
  const isFamily = role === "family"
  const openSos = status === "active" || status === "handling"
  const hint =
    (actionMsgKey ? t(actionMsgKey) : "") ||
    String(actionMsg || "").trim()

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Text style={styles.status}>{t("sos.cardStatusNew")}</Text>
          <TranslatedUgcText
            text={record.message || t("sos.needHelp")}
            sourceLang={record.sourceLang}
            messageKey={record.messageKey}
            apiBaseUrl={apiBaseUrl}
            token={token}
            style={styles.message}
          />
          <Text style={styles.name}>
            {record.patientName || t("sos.elderFallback")}
            {" · "}
            {formatSosTime(record.triggeredAt)}
          </Text>

          {hint ? <Text style={styles.hint}>{hint}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={styles.cta119} onPress={() => onOpen119?.()}>
              <Text style={styles.cta119Text}>119</Text>
            </Pressable>

            {isCaregiver && openSos ? (
              <Pressable
                style={[styles.ctaPrimary, busy && styles.disabled]}
                onPress={onResolve}
                disabled={busy}
              >
                <Text style={styles.ctaPrimaryText}>
                  {busy ? t("sos.busy") : t("sos.markHandled")}
                </Text>
              </Pressable>
            ) : null}

            {isFamily && openSos ? (
              <Pressable
                style={[styles.ctaGhost, busy && styles.disabled]}
                onPress={onRemind}
                disabled={busy}
              >
                <Text style={styles.ctaGhostText}>
                  {busy ? t("sos.busy") : t("sos.remindCaregiver")}
                </Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.ctaGhost} onPress={onOpenHealth}>
              <Text style={styles.ctaGhostText}>{t("sos.healthInfo")}</Text>
            </Pressable>
          </View>

          {isFamily ? (
            <Pressable style={styles.dismissBtn} onPress={onDismiss}>
              <Text style={styles.dismissText}>{t("sos.closeCard")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end"
  },
  panel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 10
  },
  status: {
    fontSize: 22,
    fontWeight: "800",
    color: "#b91c1c"
  },
  message: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 28
  },
  name: {
    fontSize: 13,
    color: "#64748b"
  },
  hint: {
    fontSize: 13,
    color: "#0369a1",
    fontWeight: "600"
  },
  actions: {
    gap: 10,
    marginTop: 4
  },
  cta119: {
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  cta119Text: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800"
  },
  ctaPrimary: {
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  ctaPrimaryText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700"
  },
  ctaGhost: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  ctaGhostText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "600"
  },
  badge: {
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  badgeText: {
    color: "#92400e",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center"
  },
  dismissBtn: {
    marginTop: 6,
    alignItems: "center",
    paddingVertical: 8
  },
  dismissText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600"
  },
  disabled: { opacity: 0.55 }
})
