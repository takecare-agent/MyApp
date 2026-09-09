import { Pressable, StyleSheet, Text, View } from "react-native"
import { NeoIcon } from "./NeoIcons"

export function NightLiveBadge({ label = "LIVE", on = true }) {
  return (
    <View style={[badge.wrap, on ? badge.on : badge.off]}>
      <Text style={[badge.text, on ? badge.textOn : badge.textOff]}>{label}</Text>
    </View>
  )
}

export function NightPills({ options, value, onChange }) {
  const list = Array.isArray(options) ? options : []
  return (
    <View style={styles.track}>
      {list.map((opt) => {
        const active = opt.id === value
        const count = Number(opt.badge) || 0
        return (
          <Pressable
            key={opt.id}
            style={({ pressed }) => [
              styles.pill,
              active && opt.id === "activity" ? styles.pillOnActivity : null,
              active && opt.id !== "activity" ? styles.pillOn : null,
              pressed ? styles.pressed : null
            ]}
            onPress={() => onChange(opt.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
          >
            {opt.id === "live" ? (
              <NeoIcon name="radio" size={16} color={active ? "#10B981" : "#6C727A"} />
            ) : null}
            <Text style={[
              styles.label,
              active && opt.id === "activity" ? styles.labelOnActivity : null,
              active && opt.id !== "activity" ? styles.labelOn : null
            ]}>{opt.label}</Text>
            {count > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{count > 9 ? "9+" : String(count)}</Text>
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}

const badge = StyleSheet.create({
  wrap: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  on: {
    backgroundColor: "rgba(16,185,129,0.15)"
  },
  off: {
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  text: {
    fontSize: 12,
    fontWeight: "600"
  },
  textOn: { color: "#10B981" },
  textOff: { color: "#8E95A3" }
})

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    padding: 4,
    height: 46,
    borderRadius: 999,
    borderCurve: "continuous",
    backgroundColor: "#12141A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)"
  },
  pill: {
    flex: 1,
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "transparent"
  },
  pillOn: {
    backgroundColor: "#1B382B",
    borderColor: "rgba(16,185,129,0.4)"
  },
  pillOnActivity: {
    backgroundColor: "#10B981",
    borderColor: "#10B981"
  },
  pressed: {
    opacity: 0.75
  },
  label: {
    color: "#6C727A",
    fontWeight: "600",
    fontSize: 14
  },
  labelOn: {
    color: "#10B981",
    fontWeight: "700"
  },
  labelOnActivity: {
    color: "#FFFFFF",
    fontWeight: "700"
  },
  badge: {
    width: 18,
    height: 18,
    minWidth: 18,
    borderRadius: 9,
    backgroundColor: "#FF4D4D",
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900"
  }
})
