import { useEffect, useState } from "react"
import { Image, StyleSheet, Text, View } from "react-native"
import { useI18n } from "../i18n/I18nContext"

/** Wikimedia Commons: Heimlich-manoeuver.jpg — Rama, CC BY-SA. Commons 沒有循環 gif（CPR 才有 dummy 短片）。 */
const SRC = require("../assets/aid/wiki-heimlich.jpg")

export default function HeimlichLoopAnim() {
  const { t } = useI18n()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setPhase((prev) => (prev === 0 ? 1 : 0)), 1400)
    return () => clearInterval(id)
  }, [])

  return (
    <View style={styles.wrap}>
      <Image source={SRC} style={styles.img} resizeMode="contain" />
      <View style={styles.caption}>
        <Text style={styles.captionText}>
          {phase === 0 ? t("aid.cycle.back") : t("aid.cycle.thrust")}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    aspectRatio: 420 / 249,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "rgba(255,77,77,0.55)"
  },
  img: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  caption: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(255,77,77,0.92)",
    borderRadius: 12,
    borderCurve: "continuous",
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  captionText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 16
  }
})
