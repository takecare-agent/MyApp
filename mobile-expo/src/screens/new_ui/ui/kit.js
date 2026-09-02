import { Pressable, StyleSheet, Text, View } from "react-native"
import { night } from "../tokens"

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function CardContent({ children, style }) {
  return <View style={[styles.content, style]}>{children}</View>
}

export function Button({
  children,
  onPress,
  accessibilityLabel,
  disabled,
  variant = "default",
  size = "md",
  style
}) {
  const isIcon = size === "icon"
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.btn,
        isIcon ? styles.btnIcon : styles.btnMd,
        variant === "outline" ? styles.btnOutline : null,
        variant === "ghost" ? styles.btnGhost : null,
        variant === "sos" ? styles.btnSos : null,
        variant === "default" ? styles.btnSolid : null,
        pressed ? styles.btnPressed : null,
        disabled ? styles.btnDisabled : null,
        style
      ]}
    >
      {typeof children === "string" ? (
        <Text
          style={[
            styles.btnText,
            variant === "outline" || variant === "ghost" ? styles.btnTextOnDark : null,
            variant === "sos" ? styles.btnTextSos : null
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  )
}

export function Badge({ children, tone = "default" }) {
  return (
    <View style={[styles.badge, tone === "live" ? styles.badgeLive : null]}>
      {typeof children === "string" ? (
        <Text style={[styles.badgeText, tone === "live" ? styles.badgeTextLive : null]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  )
}

export function Progress({ value = 0 }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0))
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%` }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 22,
    borderCurve: "continuous",
    overflow: "hidden"
  },
  content: {
    padding: 16,
    gap: 12
  },
  btn: {
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous"
  },
  btnMd: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12
  },
  btnIcon: {
    width: 44,
    height: 44,
    borderRadius: 12
  },
  btnSolid: {
    backgroundColor: "#161922",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)"
  },
  btnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)"
  },
  btnGhost: {
    backgroundColor: "transparent"
  },
  btnSos: {
    backgroundColor: "#FF5C00",
    borderWidth: 0
  },
  btnPressed: {
    opacity: 0.75
  },
  btnDisabled: {
    opacity: 0.45
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700"
  },
  btnTextOnDark: {
    color: "#FFFFFF"
  },
  btnTextSos: {
    color: "#FFFFFF",
    fontWeight: "700"
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  badgeLive: {
    backgroundColor: "rgba(16,185,129,0.15)"
  },
  badgeText: {
    color: "#8E95A3",
    fontSize: 12,
    fontWeight: "600"
  },
  badgeTextLive: {
    color: "#10B981",
    fontWeight: "600"
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#1C212C",
    overflow: "hidden"
  },
  fill: {
    height: "100%",
    backgroundColor: "#10B981",
    borderRadius: 999
  }
})
