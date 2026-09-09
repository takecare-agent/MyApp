import { Pressable, StyleSheet, View } from "react-native"
import { NeoIcon } from "./NeoIcons"

export function GlassCircle({ onPress, accessibilityLabel, children, size = 40 }) {
  const body = (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {children}
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? { opacity: 0.75 } : null)}
    >
      {body}
    </Pressable>
  )
}

export function IconPlay({ color = "#FFFFFF", size = 18 }) {
  return <NeoIcon name="play-fill" size={size} color={color} />
}

export function IconPause({ color = "#FFFFFF" }) {
  return (
    <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
      <View style={{ width: 3.5, height: 12, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 3.5, height: 12, borderRadius: 1, backgroundColor: color }} />
    </View>
  )
}

export function IconBack({ color = "#FFFFFF" }) {
  return <NeoIcon name="chevron-left" size={18} color={color} />
}

export function IconDots({ color = "#FFFFFF" }) {
  return (
    <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  )
}

export function IconExpand({ color = "#F4F1EA" }) {
  return <NeoIcon name="maximize-2" size={16} color={color} />
}

export function IconLive({ color = "#10B981" }) {
  return (
    <View style={styles.lamp}>
      <View style={[styles.lampDot, { backgroundColor: color }]} />
    </View>
  )
}

export function IconReload({ color = "#FFFFFF" }) {
  return <NeoIcon name="rotate-cw" size={18} color={color} />
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  lamp: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
    alignItems: "center",
    justifyContent: "center"
  },
  lampDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    boxShadow: "0 0 10px #10B981"
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2
  }
})
