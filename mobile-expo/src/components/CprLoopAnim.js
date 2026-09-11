import { Image, StyleSheet, View } from "react-native"

/** Wikimedia Commons: Chest compressions (cropped).gif — looping, CC BY */
const SRC = require("../assets/aid/chest-compressions.gif")

export default function CprLoopAnim() {
  return (
    <View style={styles.wrap}>
      <Image source={SRC} style={styles.img} resizeMode="cover" />
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
    backgroundColor: "#1A0C0C",
    borderWidth: 2,
    borderColor: "rgba(255,77,77,0.55)"
  },
  img: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  }
})
