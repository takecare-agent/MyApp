import { useCallback, useEffect, useRef, useState } from "react"
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import AidTeachMedia from "../components/AidTeachMedia"
import CprMetronome from "../components/CprMetronome"
import { useI18n } from "../i18n/I18nContext"
import { apiRequest } from "../lib/api"
import { AID_HOME_CALL, AID_HOME_NOW, AID_ROOT, AID_TREE } from "../lib/firstAidTree"
import { AID_ROUTE_TO_NODE, matchAidVoice } from "../lib/firstAidVoice"
import {
  bindUtteranceHandlers,
  destroyVoice,
  isVoiceAvailable,
  requestMicPermission,
  startListening,
  stopListening
} from "../lib/speechCare"
import { colors } from "./new_ui/tokens"
import { NeoIcon } from "./new_ui/NeoIcons"

function call119() {
  Linking.openURL("tel:119").catch(() => {})
}

function TileGrid({ tiles, t, onPick }) {
  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.id}
          style={({ pressed }) => [
            styles.tile,
            tile.urgent ? styles.tileWide : null,
            pressed ? styles.pressed : null
          ]}
          onPress={() => onPick(tile.next)}
          accessibilityRole="button"
          accessibilityLabel={t(tile.labelKey)}
        >
          {tile.image ? (
            <Image source={tile.image} style={[styles.tileImg, tile.urgent ? styles.tileImgWide : null]} resizeMode="cover" />
          ) : null}
          {tile.urgent ? (
            <>
              <View style={styles.cprBadge}>
                <NeoIcon name="alert-circle" size={14} color="#FF4D4D" />
                <Text style={styles.cprBadgeText} numberOfLines={1}>{t(tile.labelKey)}</Text>
              </View>
              <View style={styles.cprChevron}>
                <NeoIcon name="chevron-right" size={16} color="#FF4D4D" />
              </View>
            </>
          ) : (
            <View style={styles.tileLabelRow}>
              <Text style={styles.tileText} numberOfLines={1}>
                {t(tile.labelKey)}
              </Text>
              <NeoIcon name="chevron-right" size={16} color="#FF4D4D" />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  )
}

export default function CaregiverFirstAidScreen({ onBack, embedded = false, apiBaseUrl, token }) {
  const { t, lang } = useI18n()
  const [stack, setStack] = useState([AID_ROOT])
  const [listening, setListening] = useState(false)
  const [voiceHint, setVoiceHint] = useState("")
  const sessionRef = useRef(null)
  const nodeId = stack[stack.length - 1] || AID_ROOT
  const node = AID_TREE[nodeId] || null
  const atHome = nodeId === AID_ROOT
  const canPrev = stack.length > 1

  const goTo = useCallback((nextId) => {
    if (!nextId || (nextId !== AID_ROOT && !AID_TREE[nextId])) return
    setStack((prev) => [...prev, nextId])
  }, [])

  useEffect(() => {
    const routeUtterance = async (raw) => {
      setListening(false)
      if (!raw) {
        setVoiceHint(t("aid.voice.miss"))
        return
      }
      let next = null
      if (apiBaseUrl && token) {
        try {
          const data = await apiRequest({
            apiBaseUrl,
            path: "/aid-route",
            method: "POST",
            token,
            body: { text: raw }
          })
          next = AID_ROUTE_TO_NODE[data?.route] || null
        } catch {
          next = null
        }
      }
      if (!next) next = matchAidVoice(raw)
      if (next) goTo(next)
      else setVoiceHint(t("aid.voice.miss"))
    }
    sessionRef.current = bindUtteranceHandlers({
      onComplete: routeUtterance,
      onError: () => {
        setListening(false)
        setVoiceHint(t("aid.voice.miss"))
      }
    })
    return () => {
      stopListening()
      destroyVoice()
      sessionRef.current = null
    }
  }, [apiBaseUrl, goTo, t, token])

  const goPrev = useCallback(() => {
    if (stack.length <= 1) {
      onBack?.()
      return
    }
    setStack((prev) => prev.slice(0, -1))
  }, [onBack, stack.length])

  const listen = useCallback(async () => {
    if (listening) {
      await stopListening()
      setListening(false)
      setTimeout(() => sessionRef.current?.completeNow?.(), 300)
      return
    }
    const available = await isVoiceAvailable()
    if (!available) {
      setVoiceHint(t("aid.voice.miss"))
      return
    }
    const ok = await requestMicPermission()
    if (!ok) {
      setVoiceHint(t("aid.voice.miss"))
      return
    }
    setVoiceHint("")
    sessionRef.current?.reset?.()
    setListening(true)
    try {
      await startListening(lang)
    } catch {
      setListening(false)
      setVoiceHint(t("aid.voice.miss"))
    }
  }, [lang, listening, t])

  return (
    <View style={styles.flex}>
      {embedded || !onBack ? null : (
        <View style={styles.topBar}>
          <Pressable onPress={goPrev} hitSlop={12} accessibilityRole="button" style={styles.backRow}>
            <NeoIcon name="chevron-left" size={18} color="#FF4D4D" />
            <Text style={styles.back}>{canPrev ? t("aid.prev") : t("common.back")}</Text>
          </Pressable>
          <Text style={styles.topTitle}>{t("aid.title")}</Text>
          <View style={styles.topSpacer} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.pad}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {atHome ? (
          <View style={styles.block}>
            <Pressable
              style={({ pressed }) => [styles.voiceBtn, pressed ? styles.pressed : null]}
              onPress={listen}
              accessibilityRole="button"
            >
              <NeoIcon name="mic" size={16} color="#FF4D4D" />
              <Text style={styles.voiceText} numberOfLines={1}>{listening ? t("aid.voice.listen") : t("aid.voice.say")}</Text>
              <NeoIcon name="chevron-right" size={16} color="#8E95A3" />
            </Pressable>
            {voiceHint ? <Text style={styles.hint}>{voiceHint}</Text> : null}
            <Text style={styles.sec}>{t("aid.sec.now")}</Text>
            <TileGrid tiles={AID_HOME_NOW} t={t} onPick={goTo} />
            <Text style={styles.sec}>{t("aid.sec.call")}</Text>
            <TileGrid tiles={AID_HOME_CALL} t={t} onPick={goTo} />
          </View>
        ) : null}

        {!atHome && node?.videoId ? <AidTeachMedia videoId={node.videoId} t={t} /> : null}
        {!atHome && !node?.videoId && node?.image ? (
          <Image source={node.image} style={styles.hero} resizeMode="contain" />
        ) : null}

        {node?.type === "q" ? (
          <View style={styles.block}>
            <Text style={styles.prompt}>{t(node.promptKey)}</Text>
            {node.hintKey ? <Text style={styles.hint}>{t(node.hintKey)}</Text> : null}
            <View style={styles.choices}>
              {(node.choices || []).map((choice) => (
                <Pressable
                  key={choice.id}
                  style={({ pressed }) => [styles.choice, pressed ? styles.pressed : null]}
                  onPress={() => goTo(choice.next)}
                  accessibilityRole="button"
                >
                  <Text style={styles.choiceText}>{t(choice.labelKey)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {node?.type === "leaf" ? (
          <View style={styles.block}>
            <Text style={styles.prompt}>{t(node.titleKey)}</Text>
            {(node.bodyKeys || []).map((key) => (
              <Text key={key} style={styles.stepLine}>{t(key)}</Text>
            ))}
            {node.hasMetronome ? <CprMetronome t={t} enabled /> : null}
            {node.poisonTel ? (
              <Pressable
                style={({ pressed }) => [styles.choice, pressed ? styles.pressed : null]}
                onPress={() => Linking.openURL(node.poisonTel).catch(() => {})}
              >
                <Text style={styles.choiceText}>{t("aid.poison.call")}</Text>
              </Pressable>
            ) : null}
            {node.extraNext && node.extraNext.next !== nodeId ? (
              <Pressable
                style={({ pressed }) => [styles.choice, styles.choiceWarn, pressed ? styles.pressed : null]}
                onPress={() => goTo(node.extraNext.next)}
              >
                <Text style={styles.choiceText}>{t(node.extraNext.labelKey)}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setStack([AID_ROOT])}>
              <Text style={styles.restart}>{t("aid.restart")}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta119} onPress={call119} accessibilityRole="button">
          <NeoIcon name="phone" size={20} color="#FFFFFF" />
          <Text style={styles.cta119Text}>119</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  back: { color: "#FF4D4D", fontWeight: "800", fontSize: 16 },
  topTitle: { color: colors.text, fontWeight: "900", fontSize: 17 },
  topSpacer: { width: 48 },
  pad: { padding: 16, paddingBottom: 24, gap: 12 },
  block: { gap: 10 },
  sec: { color: colors.textMuted, fontWeight: "800", fontSize: 13, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "48%",
    backgroundColor: "#16181D",
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden"
  },
  tileWide: { width: "100%", position: "relative" },
  tileImg: { width: "100%", height: 92, backgroundColor: colors.card },
  tileImgWide: { height: 148 },
  tileLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6
  },
  tileText: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 14 },
  cprBadge: {
    position: "absolute",
    left: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3B0A0A",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  cprBadgeText: { color: "#FF4D4D", fontWeight: "800", fontSize: 12 },
  cprChevron: { position: "absolute", right: 10, bottom: 12 },
  voiceBtn: {
    backgroundColor: "#000000",
    borderRadius: 999,
    borderCurve: "continuous",
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  voiceText: { flex: 1, color: "#FFFFFF", fontWeight: "800" },
  hero: { width: "100%", height: 220, backgroundColor: colors.card, borderRadius: 24, borderCurve: "continuous" },
  prompt: { color: colors.text, fontWeight: "900", fontSize: 22, lineHeight: 30 },
  hint: { color: colors.textMuted, fontWeight: "600" },
  choices: { gap: 10 },
  choice: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 14
  },
  choiceWarn: { borderColor: "#E05A47", backgroundColor: "rgba(224,90,71,0.12)" },
  choiceText: { color: colors.text, fontWeight: "800", fontSize: 17, lineHeight: 24 },
  stepLine: { color: colors.text, fontWeight: "700", fontSize: 17, lineHeight: 26 },
  restart: { color: colors.pine, fontWeight: "800" },
  pressed: { opacity: 0.7 },
  footer: {
    padding: 16,
    paddingBottom: 20,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  cta119: {
    height: 56,
    backgroundColor: "#FF4D4D",
    borderRadius: 999,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  cta119Text: { color: "#fff", fontSize: 22, fontWeight: "900" }
})
