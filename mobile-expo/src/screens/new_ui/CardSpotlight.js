import { useState } from "react"
import { StyleSheet, View } from "react-native"

/**
 * Aceternity Card Spotlight 的 RN 版：卡片上的徑向光跟著手指走。
 * 影片層請設 follow=false，避免搶手勢。
 */
export function CardSpotlight({
  children,
  style,
  color = "rgba(16,185,129,0.28)",
  radius = 180,
  follow = true,
  originX = 0.82,
  originY = 0.18
}) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [spot, setSpot] = useState(null)
  const x = spot?.x ?? (size.w ? size.w * originX : radius)
  const y = spot?.y ?? (size.h ? size.h * originY : radius * 0.35)

  return (
    <View
      style={[styles.wrap, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
      }}
      onTouchStart={follow ? (e) => {
        const t = e.nativeEvent
        setSpot({ x: t.locationX, y: t.locationY })
      } : undefined}
      onTouchMove={follow ? (e) => {
        const t = e.nativeEvent
        setSpot({ x: t.locationX, y: t.locationY })
      } : undefined}
    >
      <View
        pointerEvents="none"
        style={[
          styles.spot,
          {
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            left: x - radius,
            top: y - radius,
            experimental_backgroundImage: `radial-gradient(circle, ${color} 0%, rgba(11,13,16,0) 68%)`
          }
        ]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    position: "relative"
  },
  spot: {
    position: "absolute",
    zIndex: 2
  },
  content: {
    zIndex: 1,
    width: "100%"
  }
})
