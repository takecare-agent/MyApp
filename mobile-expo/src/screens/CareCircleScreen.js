import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import {
  mobileCareCircle,
  mobileCareCircleBind,
  mobileCareCircleDissolve,
  mobileCareCircleLeave,
  mobileCareCircleRemoveMember,
  mobileCareCircleRotateInvite,
  mobileCareCircleSwitch
} from "../lib/api"
import { colors } from "./new_ui/tokens"

import { useI18n } from "../i18n/I18nContext"

function memberDisplayName(item, t) {
  const rawName = String(item?.name || "").trim()
  if (rawName && !rawName.includes("@")) return rawName
  return t(`roles.${item?.role}`) || item?.role || t("chat.unnamed")
}

export default function CareCircleScreen({
  apiBaseUrl,
  token,
  role,
  user,
  onSessionUpdate
}) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [circle, setCircle] = useState(null)
  const [bindMode, setBindMode] = useState("invite")
  const [inviteInput, setInviteInput] = useState("")
  const [emailInput, setEmailInput] = useState("")
  const [showBindForm, setShowBindForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await mobileCareCircle({ apiBaseUrl, token })
      setCircle(data)
    } catch (err) {
      setError(err.message || t("circle.loadFail"))
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, token, t])

  useEffect(() => {
    load()
  }, [load])

  const applySession = async (data) => {
    if (onSessionUpdate && data?.token) {
      await onSessionUpdate({
        token: data.token,
        role: data.role,
        user: data.user
      })
    }
  }

  const handleRotateInvite = async () => {
    setBusy(true)
    setError("")
    try {
      const data = await mobileCareCircleRotateInvite({ apiBaseUrl, token })
      setCircle(prev => ({
        ...(prev || {}),
        inviteCode: data.inviteCode,
        inviteCodeExpires: data.inviteCodeExpires
      }))
    } catch (err) {
      setError(err.message || t("circle.genFail"))
    } finally {
      setBusy(false)
    }
  }

  const handleBind = async () => {
    setBusy(true)
    setError("")
    try {
      const data = await mobileCareCircleBind({
        apiBaseUrl,
        token,
        inviteCode: bindMode === "invite" ? inviteInput.trim().toUpperCase() : undefined,
        linkedPatientEmail: bindMode === "email" ? emailInput.trim().toLowerCase() : undefined
      })
      setCircle(data)
      setShowBindForm(false)
      setInviteInput("")
      setEmailInput("")
      await applySession(data)
    } catch (err) {
      setError(err.message || t("circle.joinFail"))
    } finally {
      setBusy(false)
    }
  }

  const handleSwitch = async (patientEmail) => {
    setBusy(true)
    setError("")
    try {
      const data = await mobileCareCircleSwitch({ apiBaseUrl, token, patientEmail })
      setCircle(data)
      await applySession(data)
    } catch (err) {
      setError(err.message || t("circle.switchFail"))
    } finally {
      setBusy(false)
    }
  }

  const handleLeave = (patientEmail) => {
    Alert.alert(t("circle.leaveTitle"), t("circle.leaveMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("circle.leave"),
        style: "destructive",
        onPress: async () => {
          setBusy(true)
          setError("")
          try {
            const data = await mobileCareCircleLeave({
              apiBaseUrl,
              token,
              patientEmail
            })
            setCircle(data)
            await applySession(data)
          } catch (err) {
            setError(err.message || t("circle.leaveFail"))
          } finally {
            setBusy(false)
          }
        }
      }
    ])
  }

  const handleRemoveMember = (member) => {
    const label = memberDisplayName(member, t)
    Alert.alert(t("circle.removeTitle"), t("circle.removeMsg", { name: label }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("circle.remove"),
        style: "destructive",
        onPress: async () => {
          setBusy(true)
          setError("")
          try {
            const data = await mobileCareCircleRemoveMember({
              apiBaseUrl,
              token,
              memberEmail: member.email
            })
            setCircle(data)
          } catch (err) {
            setError(err.message || t("circle.removeFail"))
          } finally {
            setBusy(false)
          }
        }
      }
    ])
  }

  const handleDissolve = () => {
    Alert.alert(
      t("circle.dissolveTitle"),
      t("circle.dissolveMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("circle.dissolve"),
          style: "destructive",
          onPress: async () => {
            setBusy(true)
            setError("")
            try {
              const data = await mobileCareCircleDissolve({ apiBaseUrl, token })
              setCircle(data)
            } catch (err) {
              setError(err.message || t("circle.dissolveFail"))
            } finally {
              setBusy(false)
            }
          }
        }
      ]
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.pine} />
      </View>
    )
  }

  const currentRole = circle?.role || role
  const linked = circle?.activePatientEmail || circle?.linkedPatientEmail || ""
  const members = circle?.members || []
  const circles = Array.isArray(circle?.circles) ? circle.circles : []
  const isPatient = currentRole === "patient"
  const isHelper = currentRole === "family" || currentRole === "caregiver"
  const myEmail = String(user?.email || "").trim().toLowerCase()
  const others = members.filter(m => String(m.email || "").toLowerCase() !== myEmail)

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.summary}>
        <Text style={styles.summaryRole}>{t(`roles.${currentRole}`) || "—"}</Text>
        <Text style={styles.summaryEmail} numberOfLines={1}>
          {user?.email || ""}
        </Text>
        {isHelper ? (
          <Text style={styles.summaryLink} numberOfLines={1}>
            {linked ? t("circle.following", { email: linked }) : t("circle.notJoined")}
          </Text>
        ) : null}
      </View>

      {isHelper ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t("circle.myCircles")}</Text>
          {circles.length === 0 ? (
            <Text style={styles.muted}>{t("circle.noneYet")}</Text>
          ) : (
            circles.map(item => {
              const active = Boolean(item.isActive)
              return (
                <View key={item.patientEmail} style={[styles.circleRow, active && styles.circleRowActive]}>
                  <View style={styles.memberTextCol}>
                    <Text style={styles.memberMain} numberOfLines={1}>
                      {item.patientName || t("common.elder")}{active ? t("circle.watchingTag") : ""}
                    </Text>
                    <Text style={styles.memberSub} numberOfLines={1}>
                      {item.patientEmail}
                    </Text>
                  </View>
                  {!active ? (
                    <Pressable
                      style={styles.switchChip}
                      onPress={() => handleSwitch(item.patientEmail)}
                      disabled={busy}
                    >
                      <Text style={styles.switchChipText}>{t("circle.enter")}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={styles.removeChip}
                    onPress={() => handleLeave(item.patientEmail)}
                    disabled={busy}
                  >
                    <Text style={styles.removeChipText}>{t("circle.leave")}</Text>
                  </Pressable>
                </View>
              )
            })
          )}
        </View>
      ) : null}

      {isPatient ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t("circle.inviteMembers")}</Text>
          <Text style={styles.muted}>{t("circle.inviteHint")}</Text>
          {circle?.inviteCode ? (
            <Text style={styles.inviteCode}>{circle.inviteCode}</Text>
          ) : null}
          <Pressable
            style={[styles.primaryBtn, busy && styles.disabled]}
            onPress={handleRotateInvite}
            disabled={busy}
          >
            <Text style={styles.primaryBtnText}>
              {circle?.inviteCode ? t("circle.rotateInvite") : t("circle.createInvite")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isHelper ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t("circle.addCircle")}</Text>
          <Text style={styles.muted}>{t("circle.addHint")}</Text>
          {!showBindForm ? (
            <Pressable
              style={[styles.primaryBtn, busy && styles.disabled]}
              onPress={() => setShowBindForm(true)}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>{t("circle.join")}</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.modeRow}>
                <Pressable
                  style={[styles.modeChip, bindMode === "invite" && styles.modeChipActive]}
                  onPress={() => setBindMode("invite")}
                >
                  <Text
                    style={[
                      styles.modeChipText,
                      bindMode === "invite" && styles.modeChipTextActive
                    ]}
                  >
                    {t("circle.inviteCode")}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeChip, bindMode === "email" && styles.modeChipActive]}
                  onPress={() => setBindMode("email")}
                >
                  <Text
                    style={[
                      styles.modeChipText,
                      bindMode === "email" && styles.modeChipTextActive
                    ]}
                  >
                    Email
                  </Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.input}
                value={bindMode === "invite" ? inviteInput : emailInput}
                onChangeText={bindMode === "invite" ? setInviteInput : setEmailInput}
                autoCapitalize={bindMode === "invite" ? "characters" : "none"}
                keyboardType={bindMode === "invite" ? "default" : "email-address"}
                placeholder={bindMode === "invite" ? t("circle.invitePlaceholder") : t("circle.elderEmail")}
                placeholderTextColor="#8aa0b8"
              />
              <Pressable
                style={[styles.primaryBtn, busy && styles.disabled]}
                onPress={handleBind}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{t("circle.confirmJoin")}</Text>
              </Pressable>
              <Pressable onPress={() => setShowBindForm(false)} style={styles.cancelLink}>
                <Text style={styles.cancelLinkText}>{t("common.cancel")}</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>
          {isHelper ? t("circle.membersNow") : t("circle.members")}
        </Text>
        {others.length === 0 && members.length <= 1 ? (
          <Text style={styles.muted}>{t("circle.noOtherMembers")}</Text>
        ) : (
          others.map(item => (
            <View key={`${item.role}-${item.email}`} style={styles.memberRow}>
              <View style={styles.memberTextCol}>
                <Text style={styles.memberMain} numberOfLines={1}>
                  {t(`roles.${item.role}`) || item.role}　{memberDisplayName(item, t)}
                </Text>
                <Text style={styles.memberSub} numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
              {isPatient && item.role !== "patient" ? (
                <Pressable
                  style={styles.removeChip}
                  onPress={() => handleRemoveMember(item)}
                  disabled={busy}
                >
                  <Text style={styles.removeChipText}>{t("circle.remove")}</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </View>

      {isPatient ? (
        <Pressable
          style={[styles.dangerOutlineBtn, busy && styles.disabled]}
          onPress={handleDissolve}
          disabled={busy}
        >
          <Text style={styles.dangerOutlineText}>{t("circle.dissolveTitle")}</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  container: { padding: 20, paddingBottom: 36, backgroundColor: "#fff", flexGrow: 1, gap: 14 },
  summary: { paddingVertical: 4, gap: 4 },
  summaryRole: { fontSize: 20, fontWeight: "900", color: "#111827" },
  summaryEmail: { color: "#64748b", fontWeight: "600", fontSize: 13 },
  summaryLink: { color: colors.pine, fontWeight: "700", fontSize: 13, marginTop: 2 },
  block: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10
  },
  blockTitle: { color: "#111827", fontWeight: "900", fontSize: 15 },
  muted: { color: "#94a3b8", fontWeight: "600", fontSize: 13 },
  inviteCode: {
    fontSize: 30,
    letterSpacing: 5,
    fontWeight: "900",
    color: colors.pine,
    textAlign: "center",
    marginVertical: 4
  },
  modeRow: { flexDirection: "row", gap: 8 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center"
  },
  modeChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  modeChipText: { color: "#64748b", fontWeight: "800" },
  modeChipTextActive: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    color: "#111827",
    fontSize: 16
  },
  primaryBtn: {
    backgroundColor: colors.pine,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center"
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  cancelLink: { alignItems: "center", paddingVertical: 4 },
  cancelLinkText: { color: "#64748b", fontWeight: "700" },
  circleRow: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  circleRowActive: { backgroundColor: "#f0f7ff", marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  memberRow: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  memberTextCol: { flex: 1, gap: 2 },
  memberMain: { color: "#111827", fontWeight: "700", fontSize: 14 },
  memberSub: { color: "#94a3b8", fontSize: 12 },
  switchChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff"
  },
  switchChipText: { color: "#1d4ed8", fontWeight: "800", fontSize: 12 },
  removeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  },
  removeChipText: { color: "#b91c1c", fontWeight: "800", fontSize: 12 },
  dangerOutlineBtn: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#fca5a5",
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff"
  },
  dangerOutlineText: { color: "#b91c1c", fontWeight: "900" },
  error: { color: "#b42318", fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.65 }
})
