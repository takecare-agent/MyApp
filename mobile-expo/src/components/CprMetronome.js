import { useEffect, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"
import { colors } from "../screens/new_ui/tokens"

/** S2：100–120／分。紅十字節拍器常用 110。聲音為主，不用震動。 */
export const CPR_BPM = 110

const HTML = `<!DOCTYPE html><html><body>
<script>
var ctx, src;
function ensure(){
  if(!ctx) ctx=new (window.AudioContext||window.webkitAudioContext)();
  if(ctx.state==='suspended') ctx.resume();
}
function start(){
  ensure();
  stop();
  var sr=ctx.sampleRate, n=Math.round(sr*60/${CPR_BPM});
  var buf=ctx.createBuffer(1,n,sr), d=buf.getChannelData(0);
  for(var i=0;i<Math.min(400,n);i++) d[i]=Math.sin(2*Math.PI*1000*i/sr)*(1-i/400);
  src=ctx.createBufferSource();
  src.buffer=buf; src.loop=true; src.connect(ctx.destination); src.start();
}
function stop(){ try{ if(src) src.stop(); }catch(e){} src=null; }
window.__cprStart=start; window.__cprStop=stop;
</script></body></html>`

export default function CprMetronome({ t, enabled }) {
  const webRef = useRef(null)
  const [running, setRunning] = useState(false)
  const [count, setCount] = useState(0)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    if (!enabled && running) setRunning(false)
  }, [enabled, running])

  useEffect(() => {
    const js = running ? "window.__cprStart&&window.__cprStart();true;" : "window.__cprStop&&window.__cprStop();true;"
    webRef.current?.injectJavaScript(js)
    if (!running) {
      setPulse(0)
      return undefined
    }
    const id = setInterval(() => {
      setPulse((p) => (p === 0 ? 1 : 0))
      setCount((c) => (c >= 30 ? 1 : c + 1))
    }, Math.round(60000 / CPR_BPM))
    return () => {
      clearInterval(id)
      webRef.current?.injectJavaScript("window.__cprStop&&window.__cprStop();true;")
    }
  }, [running])

  if (!enabled) return null

  return (
    <View style={styles.box}>
      <WebView
        ref={webRef}
        source={{ html: HTML }}
        style={styles.web}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
      />
      <View style={[styles.beat, pulse ? styles.beatOn : null]}>
        <Text style={styles.count}>{count > 0 ? String(count) : "—"}</Text>
        <Text style={styles.bpm}>{t("aid.metro.rate")}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.btn, running ? styles.btnStop : null, pressed ? styles.pressed : null]}
        onPress={() => {
          if (running) {
            setRunning(false)
            return
          }
          setCount(0)
          setRunning(true)
        }}
        accessibilityRole="button"
        accessibilityLabel={running ? t("aid.metro.stop") : t("aid.metro.start")}
      >
        <Text style={styles.btnText}>{running ? t("aid.metro.stop") : t("aid.metro.start")}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: 10, alignItems: "center" },
  web: { width: 1, height: 1, opacity: 0 },
  beat: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderCurve: "continuous",
    backgroundColor: "#fff",
    borderWidth: 4,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  beatOn: { transform: [{ scale: 1.06 }], borderColor: "#c62828" },
  count: { color: colors.text, fontWeight: "900", fontSize: 44 },
  bpm: { color: "#667085", fontWeight: "700" },
  btn: {
    backgroundColor: colors.text,
    borderRadius: 14,
    borderCurve: "continuous",
    paddingVertical: 14,
    paddingHorizontal: 20,
    minWidth: 220,
    alignItems: "center"
  },
  btnStop: { backgroundColor: "#c62828" },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  pressed: { opacity: 0.75 }
})
