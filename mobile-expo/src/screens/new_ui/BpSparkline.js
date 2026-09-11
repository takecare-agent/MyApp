import { StyleSheet, View } from "react-native"

const PLOT_H = 56
const COL_W = 28
const MIN = 50
const MAX = 180

function yOf(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 8
  const ratio = (n - MIN) / (MAX - MIN)
  return Math.max(4, Math.min(PLOT_H - 4, ratio * PLOT_H))
}

export function toBpSparkPoints(records, max = 7) {
  const list = Array.isArray(records) ? records : []
  const parsed = []
  for (const row of list) {
    const sys = Number(row?.sys ?? row?.systolic)
    const dia = Number(row?.dia ?? row?.diastolic)
    if (!Number.isFinite(sys) || !Number.isFinite(dia)) continue
    const t = new Date(row?.measuredAt || row?.createdAt || row?.time || 0).getTime()
    parsed.push({ sys, dia, t: Number.isFinite(t) ? t : 0 })
  }
  parsed.sort((a, b) => a.t - b.t)
  const byDay = new Map()
  for (const point of parsed) {
    const d = new Date(point.t)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const bucket = byDay.get(key)
    if (bucket) bucket.push(point)
    else byDay.set(key, [point])
  }
  const days = [...byDay.keys()]
  if (days.length >= 2) {
    return days.slice(-max).map((key) => {
      const arr = byDay.get(key) || []
      const n = arr.length || 1
      return {
        sys: Math.round(arr.reduce((sum, item) => sum + item.sys, 0) / n),
        dia: Math.round(arr.reduce((sum, item) => sum + item.dia, 0) / n)
      }
    })
  }
  return parsed.slice(-max).map(({ sys, dia }) => ({ sys, dia }))
}

export default function BpSparkline({ points }) {
  const rows = Array.isArray(points)
    ? points.filter((p) => Number.isFinite(p?.sys) && Number.isFinite(p?.dia))
    : []
  if (rows.length < 2) return null

  return (
    <View style={styles.row}>
      <View pointerEvents="none" style={styles.limit130} />
      <View pointerEvents="none" style={styles.limit80} />
      {rows.map((point, index) => {
        const next = rows[index + 1]
        const sysBottom = yOf(point.sys)
        const diaBottom = yOf(point.dia)
        const nextSys = next ? yOf(next.sys) : sysBottom
        const nextDia = next ? yOf(next.dia) : diaBottom
        const sysAngle = next ? Math.atan2(sysBottom - nextSys, COL_W) : 0
        const diaAngle = next ? Math.atan2(diaBottom - nextDia, COL_W) : 0
        return (
          <View key={`${point.sys}-${point.dia}-${index}`} style={styles.col}>
            {next ? (
              <>
                <View
                  style={[
                    styles.seg,
                    styles.segSys,
                    { bottom: sysBottom, transform: [{ rotate: `${sysAngle}rad` }] }
                  ]}
                />
                <View
                  style={[
                    styles.seg,
                    styles.segDia,
                    { bottom: diaBottom, transform: [{ rotate: `${diaAngle}rad` }] }
                  ]}
                />
              </>
            ) : null}
            <View style={[styles.dot, styles.dotSys, { bottom: sysBottom }]} />
            <View style={[styles.dot, styles.dotDia, { bottom: diaBottom }]} />
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    height: PLOT_H,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    marginTop: 8,
    position: "relative"
  },
  limit130: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: yOf(130),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(239,68,68,0.45)"
  },
  limit80: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: yOf(80),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(251,191,36,0.55)"
  },
  col: {
    flex: 1,
    maxWidth: COL_W,
    position: "relative"
  },
  seg: {
    position: "absolute",
    left: "50%",
    width: COL_W,
    height: 2,
    borderRadius: 2,
    transformOrigin: "left center"
  },
  segSys: { backgroundColor: "#5EEAD4" },
  segDia: { backgroundColor: "#FBBF24" },
  dot: {
    position: "absolute",
    left: "50%",
    width: 7,
    height: 7,
    marginLeft: -3.5,
    marginBottom: -3.5,
    borderRadius: 4
  },
  dotSys: { backgroundColor: "#5EEAD4" },
  dotDia: { backgroundColor: "#FBBF24" }
})
