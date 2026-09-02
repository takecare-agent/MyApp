import { Pressable, StyleSheet, View } from "react-native"

export function GlassCircle({ onPress, accessibilityLabel, children, size = 44 }) {
  const body = (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <View pointerEvents="none" style={styles.shine} />
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

export function IconPlay({ color = "#FFFFFF" }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: 2,
        borderTopWidth: 6,
        borderBottomWidth: 6,
        borderLeftWidth: 10,
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
        borderLeftColor: color
      }}
    />
  )
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
  return (
    <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 9,
          height: 9,
          borderLeftWidth: 1.8,
          borderBottomWidth: 1.8,
          borderColor: color,
          transform: [{ rotate: "45deg" }],
          marginLeft: 3
        }}
      />
    </View>
  )
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
  const corner = {
    position: "absolute",
    width: 7,
    height: 7,
    borderColor: color,
    borderWidth: 1.6
  }
  return (
    <View style={{ width: 16, height: 16 }}>
      <View style={[corner, { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 }]} />
      <View style={[corner, { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 }]} />
      <View style={[corner, { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 }]} />
      <View style={[corner, { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 }]} />
    </View>
  )
}

export function IconReload({ color = "#F4F1EA" }) {
  return (
    <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 1.8,
          borderColor: color,
          borderRightColor: "transparent"
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 1,
          right: 2,
          width: 0,
          height: 0,
          borderTopWidth: 4,
          borderBottomWidth: 4,
          borderLeftWidth: 5,
          borderTopColor: "transparent",
          borderBottomColor: "transparent",
          borderLeftColor: color
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), 0 10px 24px rgba(0,0,0,0.28)"
  },
  shine: {
    position: "absolute",
    top: 0,
    left: 6,
    right: 6,
    height: 10,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2
  }
})
