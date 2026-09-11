import { useCallback, useState } from "react"
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import AidTeachMedia from "../components/AidTeachMedia"
import CprLoopAnim from "../components/CprLoopAnim"
import HeimlichLoopAnim from "../components/HeimlichLoopAnim"
import CprMetronome from "../components/CprMetronome"
import { useI18n } from "../i18n/I18nContext"
import { AID_ROOT, AID_TREE } from "../lib/firstAidTree"
import { colors } from "./new_ui/tokens"
import { NeoIcon } from "./new_ui/NeoIcons"

const TILE_IMG = {
  cpr: require("../assets/emergency/cpr.png"),
  choking: require("../assets/emergency/choke.png"),
  fall: require("../assets/emergency/fall.png"),
  stroke: require("../assets/emergency/stroke.png")
}

const HOME_CARDS = [
  { id: "cpr", quadrant: "cpr", labelKey: "aid.home.cpr", next: "leaf_cpr", chevron: "#FF4D4D" },
  { id: "choke", quadrant: "choking", labelKey: "aid.home.choke", next: "q2a", chevron: "#FFA726" },
  { id: "fall", quadrant: "fall", labelKey: "aid.home.fall", next: "leaf_fall", chevron: "#FF4D4D" },
  { id: "fast", quadrant: "stroke", labelKey: "aid.home.fast", next: "leaf_fast", chevron: "#10B981" }
]

function call119() {
  Linking.openURL("tel:119").catch(() => {})
}

function EmergencyIconCard({ quadrant }) {
  return (
    <View style={styles.iconMask}>
      <Image source={TILE_IMG[quadrant]} style={styles.iconImg} resizeMode="cover" />
    </View>
  )
}

export default function CaregiverFirstAidScreen({ onBack, embedded = false }) {
  const { t } = useI18n()
  const [stack, setStack] = useState([AID_ROOT])
  const nodeId = stack[stack.length - 1] || AID_ROOT
  const node = AID_TREE[nodeId] || null
  const atHome = nodeId === AID_ROOT
  const canPrev = stack.length > 1

  const goTo = useCallback((nextId) => {
    if (!nextId || (nextId !== AID_ROOT && !AID_TREE[nextId])) return
    setStack((prev) => [...prev, nextId])
  }, [])

  const goPrev = useCallback(() => {
    if (stack.length <= 1) {
      onBack?.()
      return
    }
    setStack((prev) => prev.slice(0, -1))
  }, [onBack, stack.length])

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
        scrollEnabled={!node?.hasMetronome}
      >
        {atHome ? (
          <View style={styles.block}>
            <View style={styles.grid}>
              {HOME_CARDS.map((card) => (
                <Pressable
                  key={card.id}
                  style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null]}
                  onPress={() => goTo(card.next)}
                  accessibilityRole="button"
                  accessibilityLabel={t(card.labelKey)}
                >
                  <EmergencyIconCard quadrant={card.quadrant} />
                  <View style={styles.tileLabelRow}>
                    <Text style={styles.tileText} numberOfLines={2}>
                      {t(card.labelKey)}
                    </Text>
                    <NeoIcon name="chevron-right" size={16} color={card.chevron} />
                  </View>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [styles.moreBtn, pressed ? styles.pressed : null]}
              onPress={() => goTo("q0")}
            >
              <Text style={styles.moreText}>{t("aid.home.more")}</Text>
              <NeoIcon name="chevron-right" size={16} color="#8E95A3" />
            </Pressable>
          </View>
        ) : null}

        {!atHome && node?.loopAnim === "cpr" ? <CprLoopAnim /> : null}
        {!atHome && node?.loopAnim === "heimlich" ? <HeimlichLoopAnim /> : null}
        {!atHome && !node?.loopAnim && node?.videoId ? <AidTeachMedia videoId={node.videoId} t={t} /> : null}

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
            {(node.bodyKeys || []).map((key, index) => (
              <View key={key} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{String(index + 1)}</Text>
                </View>
                <Text style={styles.stepLine}>{t(key)}</Text>
              </View>
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
  pad: { padding: 12, paddingBottom: 12, gap: 8 },
  block: { gap: 10 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14
  },
  tile: {
    width: "48%",
    backgroundColor: "#16181D",
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 10,
    overflow: "hidden"
  },
  iconMask: {
    width: "100%",
    height: 110,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: "#16181D"
  },
  iconImg: {
    width: "100%",
    height: "100%"
  },
  tileLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 6
  },
  tileText: { flex: 1, color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  moreBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#16181D",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  moreText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  hero: { width: "100%", height: 128, backgroundColor: colors.card, borderRadius: 16, borderCurve: "continuous" },
  prompt: { color: "#FFFFFF", fontWeight: "900", fontSize: 20, lineHeight: 26, marginBottom: 6 },
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
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FF4D4D",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  stepNumText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  stepLine: { flex: 1, color: "#FFFFFF", fontWeight: "700", fontSize: 14, lineHeight: 24 },
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
    borderRadius: 16,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center"
  },
  cta119Text: { color: "#fff", fontSize: 20, fontWeight: "900" }
})
