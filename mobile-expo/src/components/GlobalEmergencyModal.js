import { useEffect, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { useI18n } from "../i18n/I18nContext"
import { formatDateTime } from "../i18n/dateLocale"
import { NeoIcon } from "../screens/new_ui/NeoIcons"
import { AvatarMark } from "./AvatarMark"
import TranslatedUgcText from "./TranslatedUgcText"
import HealthCardReadonly from "./HealthCardReadonly"

export default function GlobalEmergencyModal({
  visible,
  record,
  role,
  busy,
  actionMsg,
  actionMsgKey,
  apiBaseUrl,
  token,
  healthCard,
  healthLoading,
  healthError,
  onResolve,
  onRemind,
  onOpen119,
  onOpenHealth,
  onOpenFullGuide,
  onDismiss
}) {
  const { t, lang } = useI18n()
  const [page, setPage] = useState("sos")
  const open = Boolean(visible && record)
  const status = record?.status
  const isFall = record?.kind === "fall"
  const isCaregiver = role === "caregiver"
  const isFamily = role === "family"
  const fallNeedsAck = isFall && (status === "active" || status === "handling")
  const openSos = !isFall && (status === "active" || status === "handling")
  const statusLabel = isFall
    ? (fallNeedsAck
      ? (record?.severity === "Critical" ? t("alert.severity.Critical") : t("alert.severity.High"))
      : "")
    : t("sos.cardStatusNew")
  const fallMessage = t("fall.cardMessage")
  const hint =
    (actionMsgKey ? t(actionMsgKey) : "") ||
    String(actionMsg || "").trim()
  const locationLabel = isFall ? "" : String(record?.locationLabel || "").trim()
  const elderName = record?.patientName || t("sos.elderFallback")

  useEffect(() => {
    if (!open) setPage("sos")
  }, [open])

  return (
    <Modal animationType="fade" transparent visible={open} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          {page === "health" ? (
            <HealthCardReadonly
              card={healthCard}
              patientName={healthCard?.patientName || elderName}
              loading={healthLoading}
              error={healthError}
              onClose={() => setPage("sos")}
              onOpenFullGuide={() => {
                setPage("sos")
                onOpenFullGuide?.()
              }}
            />
          ) : (
            <>
              {statusLabel ? (
              <View style={[styles.statusPill, isFall && !fallNeedsAck ? styles.fallStatusPill : null]}>
                <View style={[styles.statusDot, isFall && !fallNeedsAck ? styles.fallStatusDot : null]} />
                <Text style={[styles.statusText, isFall && !fallNeedsAck ? styles.fallStatusText : null]}>
                  {statusLabel}
                </Text>
              </View>
              ) : null}
              {isFall ? (
                <Text style={styles.message}>{fallMessage}</Text>
              ) : (
                <TranslatedUgcText
                  text={record?.message || t("sos.needHelp")}
                  sourceLang={record?.sourceLang}
                  messageKey={record?.messageKey}
                  apiBaseUrl={apiBaseUrl}
                  token={token}
                  style={styles.message}
                />
              )}
              <View style={styles.metaRow}>
                <AvatarMark
                  email={record?.patientEmail}
                  size={28}
                  apiBaseUrl={apiBaseUrl}
                  token={token}
                  inModal
                />
                <Text style={styles.metaText} numberOfLines={2}>
                  {elderName}
                  {" · "}
                  {formatDateTime(record?.triggeredAt, lang)}
                </Text>
                {locationLabel ? (
                  <View style={styles.locPill}>
                    <NeoIcon name="home" size={12} color="#8E95A3" />
                    <Text style={styles.locText} numberOfLines={1}>
                      {locationLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
              {hint ? <Text style={styles.hint}>{hint}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={styles.cta119} onPress={() => onOpen119?.()}>
                  <NeoIcon name="call" size={22} color="#FFFFFF" />
                  <Text style={styles.cta119Text}>119</Text>
                </Pressable>
                {isCaregiver && (openSos || fallNeedsAck) ? (
                  <Pressable
                    style={[styles.ctaHandled, busy ? styles.disabled : null]}
                    onPress={onResolve}
                    disabled={busy}
                  >
                    <View style={styles.checkCircle}>
                      <NeoIcon name="check" size={14} color="#10B981" />
                    </View>
                    <Text style={styles.ctaHandledText}>
                      {busy ? t("sos.busy") : (fallNeedsAck ? t("fall.markViewed") : t("sos.markHandled"))}
                    </Text>
                  </Pressable>
                ) : null}
                {isFamily && openSos ? (
                  <Pressable
                    style={[styles.ctaHandled, busy ? styles.disabled : null]}
                    onPress={onRemind}
                    disabled={busy}
                  >
                    <Text style={styles.ctaHandledText}>
                      {busy ? t("sos.busy") : t("sos.remindCaregiver")}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.ctaHealth}
                  onPress={() => {
                    setPage("health")
                    onOpenHealth?.()
                  }}
                >
                  <Text style={styles.ctaHealthText}>{t("sos.healthInfo")}</Text>
                  <NeoIcon name="chevron-right" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
              {((!openSos && !fallNeedsAck) || isFamily) ? (
                <Pressable style={styles.dismissBtn} onPress={onDismiss}>
                  <Text style={styles.dismissText}>{t("sos.closeCard")}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(8, 10, 12, 0.55)",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 18
  },
  panel: {
    backgroundColor: "#16181D",
    borderRadius: 28,
    borderCurve: "continuous",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 12,
    maxHeight: "88%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 61, 61, 0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B3B"
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FF5C5C"
  },
  fallStatusPill: {
    backgroundColor: "rgba(245, 158, 11, 0.14)"
  },
  fallStatusDot: {
    backgroundColor: "#F59E0B"
  },
  fallStatusText: {
    color: "#FBBF24"
  },
  message: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 36
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: "#8E95A3",
    fontWeight: "600"
  },
  locPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#12141A",
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 120
  },
  locText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#C5CAD3"
  },
  hint: {
    fontSize: 13,
    color: "#10B981",
    fontWeight: "600"
  },
  actions: {
    gap: 10,
    marginTop: 4
  },
  cta119: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#FF3B3B",
    borderRadius: 18,
    borderCurve: "continuous",
    paddingVertical: 16,
    boxShadow: "0 8px 24px rgba(255, 59, 59, 0.35)"
  },
  cta119Text: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800"
  },
  ctaHandled: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#12141A",
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: "#10B981",
    paddingVertical: 14
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#10B981",
    alignItems: "center",
    justifyContent: "center"
  },
  ctaHandledText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700"
  },
  ctaHealth: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#12141A",
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  ctaHealthText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700"
  },
  dismissBtn: {
    marginTop: 2,
    alignItems: "center",
    paddingVertical: 8
  },
  dismissText: {
    color: "#8E95A3",
    fontSize: 14,
    fontWeight: "600"
  },
  disabled: { opacity: 0.55 }
})
