import { Pressable, StyleSheet, Text, View } from "react-native"

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
              active ? styles.pillOn : null,
              pressed ? styles.pressed : null
            ]}
            onPress={() => onChange(opt.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
          >
            <Text style={[styles.label, active ? styles.labelOn : null]}>{opt.label}</Text>
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
    gap: 4,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    padding: 4,
    borderRadius: 999,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 18px rgba(0,0,0,0.22)"
  },
  pill: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    borderCurve: "continuous"
  },
  pillOn: {
    backgroundColor: "rgba(255,255,255,0.10)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 18px rgba(0,0,0,0.22)"
  },
  pressed: {
    opacity: 0.75
  },
  label: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "600",
    fontSize: 13
  },
  labelOn: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700"
  }
})
