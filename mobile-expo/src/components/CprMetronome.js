import { useEffect, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native"
import { WebView } from "react-native-webview"
import { NeoIcon } from "../screens/new_ui/NeoIcons"

export const CPR_BPM = 110
const TICK_COUNT = 36
const TICKS = Array.from({ length: TICK_COUNT }, (_, i) => i)

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
      Vibration.vibrate(40)
    }, Math.round(60000 / CPR_BPM))
    return () => {
      clearInterval(id)
      Vibration.cancel()
      webRef.current?.injectJavaScript("window.__cprStop&&window.__cprStop();true;")
    }
  }, [running])

  const toggle = () => {
    if (running) {
      setRunning(false)
      return
    }
    setCount(0)
    setRunning(true)
  }

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
      <View style={[styles.halo, pulse ? styles.haloOn : null]}>
        <View style={styles.ring}>
          {TICKS.map((i) => (
            <View
              key={i}
              pointerEvents="none"
              style={[styles.tickArm, { transform: [{ rotate: `${(360 / TICK_COUNT) * i}deg` }] }]}
            >
              <View style={styles.tick} />
            </View>
          ))}
          <Pressable
            style={styles.disc}
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={running ? t("aid.metro.stop") : t("aid.metro.start")}
          >
            <Text style={styles.bpmNum}>{String(CPR_BPM)}</Text>
            <Text style={styles.bpmUnit}>/ min</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.countPill}>
        <NeoIcon name="activity" size={14} color="#FF4D4D" />
        <Text style={styles.countText}>{`${count} / 30`}</Text>
      </View>
      <Pressable onPress={toggle} accessibilityRole="button">
        <Text style={[styles.ctrl, running ? styles.ctrlStop : null]}>
          {running ? t("aid.metro.stop") : t("aid.metro.start")}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: 8, alignItems: "center", paddingTop: 4 },
  web: { width: 1, height: 1, opacity: 0 },
  halo: {
    padding: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,77,77,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.4)",
    shadowColor: "#FF4D4D",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 }
  },
  haloOn: { backgroundColor: "rgba(255,77,77,0.22)" },
  ring: {
    width: 132,
    height: 132,
    alignItems: "center",
    justifyContent: "center"
  },
  tickArm: {
    position: "absolute",
    width: 132,
    height: 132,
    alignItems: "center"
  },
  tick: {
    width: 2,
    height: 7,
    borderRadius: 1,
    backgroundColor: "rgba(255,77,77,0.7)",
    marginTop: 2
  },
  disc: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  bpmNum: {
    color: "#000000",
    fontSize: 28,
    fontWeight: "900",
    fontVariant: ["tabular-nums"]
  },
  bpmUnit: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#16181D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 16
  },
  countText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  ctrl: { color: "#10B981", fontWeight: "700", fontSize: 13, paddingVertical: 2 },
  ctrlStop: { color: "#FF4D4D" }
})
