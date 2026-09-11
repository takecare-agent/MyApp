import { StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"

export default function AidTeachMedia({ videoId, t }) {
  if (!videoId) return null
  const uri = `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1&fs=1`
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <WebView
          source={{ uri }}
          style={styles.web}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
        />
      </View>
      {t ? <Text style={styles.cap}>{t("aid.media.demo")}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: {
    height: 220,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  web: { flex: 1, backgroundColor: "#111" },
  cap: { color: "#8E95A3", fontWeight: "700", fontSize: 13 }
})
