import { useEffect, useRef, useState } from "react"
import { DeviceEventEmitter, NativeModules, Pressable, StyleSheet, Text, View, Platform } from "react-native"
import { WebView } from "react-native-webview"
import { NeoIcon } from "../screens/new_ui/NeoIcons"

const VoiceWav = NativeModules.VoiceWav

const RECORDER_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>
<script>
let stream=null, ctx=null, proc=null, chunks=[], sr=null, srText="", sampleRate=16000, live=false;
function toB64(buf){
  const bytes=new Uint8Array(buf);
  let binary="";
  const step=0x8000;
  for(let i=0;i<bytes.length;i+=step){
    binary+=String.fromCharCode.apply(null, bytes.subarray(i,i+step));
  }
  return btoa(binary);
}
function downsample(f32, from, to){
  if(from===to) return f32;
  const ratio=from/to;
  const len=Math.max(1, Math.floor(f32.length/ratio));
  const out=new Float32Array(len);
  for(let i=0;i<len;i++){
    const x=i*ratio;
    const i0=Math.floor(x);
    const i1=Math.min(f32.length-1, i0+1);
    const t=x-i0;
    out[i]=f32[i0]*(1-t)+f32[i1]*t;
  }
  return out;
}
function amplify(f32){
  let peak=0, sum=0;
  for(let i=0;i<f32.length;i++){
    const a=Math.abs(f32[i]);
    if(a>peak) peak=a;
    sum+=f32[i]*f32[i];
  }
  const rms=Math.sqrt(sum/Math.max(1,f32.length));
  const gPeak=peak>0.002 ? Math.min(16, 0.88/peak) : 1;
  const gRms=rms>0.0006 ? Math.min(16, 0.11/rms) : 1;
  const g=Math.max(gPeak, gRms);
  const out=new Float32Array(f32.length);
  for(let i=0;i<f32.length;i++){
    const v=f32[i]*g;
    out[i]=v>1?1:v<-1?-1:v;
  }
  return out;
}
function padSilence(f32, rate, ms){
  const n=Math.max(0, Math.floor(rate*ms/1000));
  const out=new Float32Array(f32.length+n*2);
  out.set(f32, n);
  return out;
}
function encodeWav(f32, rate){
  const bytes=f32.length*2;
  const buf=new ArrayBuffer(44+bytes);
  const v=new DataView(buf);
  const w=function(off, s){ for(let i=0;i<s.length;i++) v.setUint8(off+i, s.charCodeAt(i)); };
  w(0,"RIFF"); v.setUint32(4, 36+bytes, true); w(8,"WAVE"); w(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,rate,true); v.setUint32(28,rate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
  w(36,"data"); v.setUint32(40,bytes,true);
  let o=44;
  for(let i=0;i<f32.length;i++,o+=2){
    const s=Math.max(-1, Math.min(1, f32[i]));
    v.setInt16(o, s<0 ? s*0x8000 : s*0x7fff, true);
  }
  return buf;
}
function startSpeech(locale){
  srText="";
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return;
  try{
    sr=new SR();
    sr.lang=locale||"zh-TW";
    sr.continuous=true;
    sr.interimResults=true;
    sr.onresult=function(e){
      let t="";
      for(let i=0;i<e.results.length;i++) t+=e.results[i][0].transcript;
      srText=t;
      window.ReactNativeWebView.postMessage(JSON.stringify({ok:true, partial:true, transcript:t}));
    };
    sr.start();
  }catch(e){}
}
async function startRec(locale, useSpeech){
  if(live) return;
  live=true;
  chunks=[]; srText="";
  try{
    stream=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}
    });
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    if(ctx.resume) await ctx.resume();
    sampleRate=ctx.sampleRate||44100;
    const src=ctx.createMediaStreamSource(stream);
    proc=ctx.createScriptProcessor(4096,1,1);
    proc.onaudioprocess=function(e){
      if(!live) return;
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    const gain=ctx.createGain(); gain.gain.value=0.002;
    src.connect(proc); proc.connect(gain); gain.connect(ctx.destination);
    if(useSpeech) startSpeech(locale);
    window.ReactNativeWebView.postMessage(JSON.stringify({ok:true, started:true}));
  }catch(err){
    live=false;
    window.ReactNativeWebView.postMessage(JSON.stringify({ok:false, error:String(err||"mic")}));
  }
}
function stopRec(){
  if(!live) return;
  live=false;
  try{ if(sr) sr.stop(); }catch(e){}
  sr=null;
  try{ if(proc) proc.disconnect(); }catch(e){}
  try{ if(ctx) ctx.close(); }catch(e){}
  try{ if(stream) stream.getTracks().forEach(function(t){t.stop();}); }catch(e){}
  proc=null; ctx=null; stream=null;
  let total=0;
  for(let i=0;i<chunks.length;i++) total+=chunks[i].length;
  const merged=new Float32Array(total);
  let off=0;
  for(let i=0;i<chunks.length;i++){ merged.set(chunks[i], off); off+=chunks[i].length; }
  const pcm=padSilence(amplify(downsample(merged, sampleRate, 16000)), 16000, 400);
  const wav=encodeWav(pcm, 16000);
  window.ReactNativeWebView.postMessage(JSON.stringify({ok:true, mime:"audio/wav", b64:toB64(wav), transcript:srText||""}));
}
</script></body></html>`

const WAVE_BARS = [8, 16, 11, 20, 9, 14, 18, 7, 12, 15]

function fmtDur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, "0")}`
}

function AndroidNativeRecorder({ recording, onStarted, onRecorded, onFail, onPartial, transcribePartial }) {
  const armedRef = useRef(false)
  const cbs = useRef({ onStarted, onRecorded, onFail, onPartial, transcribePartial })
  cbs.current = { onStarted, onRecorded, onFail, onPartial, transcribePartial }

  useEffect(() => {
    if (recording) {
      if (armedRef.current) return
      armedRef.current = true
      VoiceWav.start()
        .then(() => cbs.current.onStarted?.())
        .catch((e) => {
          armedRef.current = false
          cbs.current.onFail?.(e?.code || e?.message || "mic")
        })
      return
    }
    if (!armedRef.current) return
    armedRef.current = false
    VoiceWav.stop()
      .then((res) => cbs.current.onRecorded?.(res))
      .catch((e) => cbs.current.onFail?.(e?.code || e?.message || "mic"))
  }, [recording])

  useEffect(() => {
    if (!recording || typeof VoiceWav?.snapshot !== "function") return
    let busy = false
    const tick = async () => {
      if (busy) return
      const transcribe = cbs.current.transcribePartial
      const onPartial = cbs.current.onPartial
      if (!transcribe || !onPartial) return
      busy = true
      try {
        const snap = await VoiceWav.snapshot()
        if (snap?.b64) {
          const text = await transcribe(snap.b64)
          if (text) onPartial(text)
        }
      } catch {
        // keep recording
      }
      busy = false
    }
    const startAt = setTimeout(tick, 2000)
    const id = setInterval(tick, 4000)
    return () => {
      clearTimeout(startAt)
      clearInterval(id)
    }
  }, [recording])

  useEffect(() => {
    return () => {
      if (!armedRef.current) return
      armedRef.current = false
      VoiceWav.stop().catch(() => {})
    }
  }, [])

  return null
}

function WebViewRecorder({ recording, locale, enableSpeech, onStarted, onPartial, onRecorded, onFail }) {
  const ref = useRef(null)
  const readyRef = useRef(false)
  const wantRef = useRef(false)
  const armedRef = useRef(false)
  const startedOnceRef = useRef(false)
  const localeRef = useRef(locale || "zh-TW")
  const speechRef = useRef(enableSpeech !== false)
  localeRef.current = locale || "zh-TW"
  speechRef.current = enableSpeech !== false

  const startJs = () =>
    `startRec(${JSON.stringify(localeRef.current)}, ${speechRef.current ? "true" : "false"}); true;`

  useEffect(() => {
    wantRef.current = recording
    if (!ref.current || !readyRef.current) return
    if (recording) {
      armedRef.current = true
      ref.current.injectJavaScript(startJs())
    } else if (armedRef.current) {
      armedRef.current = false
      ref.current.injectJavaScript("stopRec(); true;")
    }
  }, [recording])

  return (
    <WebView
      ref={ref}
      source={{ html: RECORDER_HTML, baseUrl: "https://localhost/" }}
      style={styles.hidden}
      javaScriptEnabled
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      originWhitelist={["*"]}
      onLoadEnd={() => {
        if (startedOnceRef.current && readyRef.current) return
        startedOnceRef.current = true
        readyRef.current = true
        if (wantRef.current) {
          armedRef.current = true
          ref.current?.injectJavaScript(startJs())
        }
      }}
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data || "{}")
          if (data.partial && data.transcript) {
            onPartial?.(data.transcript)
            return
          }
          if (data.started) {
            onStarted?.()
            return
          }
          if (data.ok && data.b64) {
            onRecorded?.({
              mime: data.mime || "audio/wav",
              b64: data.b64,
              transcript: data.transcript || ""
            })
            return
          }
          if (data.ok === false) onFail?.(data.error || "mic")
        } catch {
          onFail?.("parse")
        }
      }}
    />
  )
}

export function ChatVoiceRecorder(props) {
  if (Platform.OS === "android" && typeof VoiceWav?.start === "function") {
    return (
      <AndroidNativeRecorder
        recording={props.recording}
        onStarted={props.onStarted}
        onRecorded={props.onRecorded}
        onFail={props.onFail}
        onPartial={props.onPartial}
        transcribePartial={props.transcribePartial}
      />
    )
  }
  return <WebViewRecorder {...props} />
}

const PLAYER_HTML = (src) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<audio id="a" src="${src}" preload="auto" playsinline webkit-playsinline></audio>
<script>
var a=document.getElementById("a");
function notify(state){ window.ReactNativeWebView.postMessage(state); }
function toggle(){
  if(a.paused){ a.play().catch(function(){}); }
  else { a.pause(); }
}
a.onplay=function(){ notify("play"); };
a.onpause=function(){ notify("pause"); };
a.onended=function(){
  try { a.currentTime=0; } catch(e) {}
  notify("pause");
};
</script></body></html>`

export function ChatVoiceBubble({
  audioUrl,
  caption,
  isMe,
  playLabel,
  pageOrigin,
  durationSec
}) {
  const nativePlay = Platform.OS === "android" && typeof VoiceWav?.playWav === "function"
  if (nativePlay) {
    return (
      <AndroidVoiceBubble
        audioUrl={audioUrl}
        caption={caption}
        isMe={isMe}
        playLabel={playLabel}
        durationSec={durationSec}
      />
    )
  }
  return (
    <WebViewVoiceBubble
      audioUrl={audioUrl}
      caption={caption}
      isMe={isMe}
      playLabel={playLabel}
      pageOrigin={pageOrigin}
      durationSec={durationSec}
    />
  )
}

function bytesToB64(bytes) {
  let binary = ""
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

async function fetchWavB64(url) {
  const token = (() => {
    try {
      return new URL(url).searchParams.get("access_token") || ""
    } catch {
      return ""
    }
  })()
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (!res.ok) throw new Error(`http ${res.status}`)
  const buf = await res.arrayBuffer()
  return bytesToB64(new Uint8Array(buf))
}

let androidPlayingSrc = ""
let androidPlayGen = 0
let androidIgnoreEndedUntil = 0

function AndroidVoiceBubble({ audioUrl, caption, isMe, playLabel, durationSec }) {
  const [playing, setPlaying] = useState(false)
  const src = String(audioUrl || "")
  const busyRef = useRef(false)

  useEffect(() => {
    const sync = () => setPlaying(Boolean(src) && androidPlayingSrc === src)
    const started = DeviceEventEmitter.addListener("VoiceWavStarted", sync)
    const ended = DeviceEventEmitter.addListener("VoiceWavEnded", () => {
      if (Date.now() < androidIgnoreEndedUntil) {
        sync()
        return
      }
      if (androidPlayingSrc === src) androidPlayingSrc = ""
      setPlaying(false)
    })
    return () => {
      started.remove()
      ended.remove()
    }
  }, [src])

  const onPress = async () => {
    if (!src || !VoiceWav) return
    if (playing) {
      androidIgnoreEndedUntil = 0
      androidPlayingSrc = ""
      VoiceWav.stopPlay?.()
      setPlaying(false)
      return
    }
    if (busyRef.current) return
    busyRef.current = true
    androidPlayGen += 1
    const gen = androidPlayGen
    androidIgnoreEndedUntil = Date.now() + 500
    androidPlayingSrc = src
    setPlaying(true)
    try {
      const b64 = await fetchWavB64(src)
      if (gen !== androidPlayGen || androidPlayingSrc !== src) return
      await VoiceWav.playWav(b64)
      if (gen === androidPlayGen && androidPlayingSrc === src) setPlaying(true)
    } catch {
      if (gen === androidPlayGen && androidPlayingSrc === src) {
        androidPlayingSrc = ""
        setPlaying(false)
      }
    } finally {
      busyRef.current = false
    }
  }

  return (
    <VoiceBubbleFrame
      playing={playing}
      isMe={isMe}
      playLabel={durationSec > 0 ? fmtDur(durationSec) : playLabel}
      caption={caption}
      onPress={onPress}
    />
  )
}

function WebViewVoiceBubble({ audioUrl, caption, isMe, playLabel, pageOrigin, durationSec }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const src = String(audioUrl || "").replace(/"/g, "").replace(/</g, "")
  const origin = String(pageOrigin || "").replace(/"/g, "").replace(/\/+$/, "")

  return (
    <>
      <VoiceBubbleFrame
        playing={playing}
        isMe={isMe}
        playLabel={durationSec > 0 ? fmtDur(durationSec) : playLabel}
        caption={caption}
        onPress={() => ref.current?.injectJavaScript("toggle(); true;")}
      />
      <WebView
        ref={ref}
        source={{ html: PLAYER_HTML(src), baseUrl: origin || "http://127.0.0.1/" }}
        style={styles.hidden}
        javaScriptEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        onMessage={(e) => {
          const state = String(e?.nativeEvent?.data || "")
          setPlaying(state === "play")
        }}
      />
    </>
  )
}

function VoiceBubbleFrame({ playing, isMe, playLabel, caption, onPress }) {
  return (
    <View style={styles.voiceBlock}>
      <Pressable
        onPress={onPress}
        android_ripple={{ color: "transparent" }}
        style={({ pressed }) => [
          styles.capsule,
          isMe ? styles.capsuleMe : styles.capsuleThem,
          pressed ? styles.capsulePressed : null
        ]}
        accessibilityRole="button"
        accessibilityLabel={playLabel}
      >
        <View style={[styles.playBtn, isMe ? styles.playBtnMe : styles.playBtnThem]}>
          <NeoIcon name={playing ? "play-fill" : "play"} size={14} color={isMe ? "#04140E" : "#FFFFFF"} />
        </View>
        <View style={styles.bars}>
          {WAVE_BARS.map((h, i) => (
            <View
              key={`${h}-${i}`}
              style={[
                styles.bar,
                { height: playing ? h + 4 : h },
                isMe ? styles.barMe : styles.barThem
              ]}
            />
          ))}
        </View>
        <Text style={[styles.playHint, isMe ? styles.playHintMe : styles.playHintThem]}>{playLabel}</Text>
      </Pressable>
      {caption ? (
        <Text style={[styles.caption, isMe ? styles.captionMe : styles.captionThem]}>{caption}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hidden: {
    width: Platform.OS === "android" ? 16 : 1,
    height: Platform.OS === "android" ? 16 : 1,
    opacity: 0.01,
    position: "absolute",
    left: 0,
    top: 0
  },
  voiceBlock: { gap: 8, minWidth: 196, maxWidth: 280 },
  capsule: {
    minHeight: 48,
    borderRadius: 18,
    borderCurve: "continuous",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  capsulePressed: { opacity: 0.88 },
  capsuleMe: { backgroundColor: "rgba(4,20,14,0.28)" },
  capsuleThem: {
    backgroundColor: "#12281E",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)"
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  playBtnMe: { backgroundColor: "#FFFFFF" },
  playBtnThem: { backgroundColor: "#10B981" },
  bars: { flexDirection: "row", alignItems: "center", gap: 2, height: 22, flex: 1 },
  bar: { width: 3, borderRadius: 2 },
  barMe: { backgroundColor: "rgba(255,255,255,0.85)" },
  barThem: { backgroundColor: "#A8E6CF" },
  playHint: { fontSize: 12, fontWeight: "800" },
  playHintMe: { color: "rgba(255,255,255,0.88)" },
  playHintThem: { color: "#D1FAE5" },
  caption: { fontSize: 17, lineHeight: 24, fontWeight: "700" },
  captionMe: { color: "#FFFFFF" },
  captionThem: { color: "#F4FFFB" }
})
