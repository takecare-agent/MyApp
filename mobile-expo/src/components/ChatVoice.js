import { useEffect, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"
import { colors } from "../screens/new_ui/tokens"

const RECORDER_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>
<script>
let rec=null, stream=null, chunks=[];
function toB64(buf){
  const bytes=new Uint8Array(buf);
  let binary="";
  const step=0x8000;
  for(let i=0;i<bytes.length;i+=step){
    binary+=String.fromCharCode.apply(null, bytes.subarray(i,i+step));
  }
  return btoa(binary);
}
async function startRec(){
  chunks=[];
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"";
    rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
    rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
    rec.onstop=async function(){
      try{ stream.getTracks().forEach(function(t){t.stop();}); }catch(e){}
      const type=(rec&&rec.mimeType)||"audio/webm";
      const blob=new Blob(chunks,{type:type});
      const buf=await blob.arrayBuffer();
      window.ReactNativeWebView.postMessage(JSON.stringify({ok:true, mime:type, b64:toB64(buf)}));
    };
    rec.start();
    window.ReactNativeWebView.postMessage(JSON.stringify({ok:true, started:true}));
  }catch(err){
    window.ReactNativeWebView.postMessage(JSON.stringify({ok:false, error:String(err||"mic")}));
  }
}
function stopRec(){
  try{ if(rec&&rec.state==="recording") rec.stop(); }catch(e){}
}
</script></body></html>`

export function ChatVoiceRecorder({ recording, onStarted, onRecorded, onFail }) {
  const ref = useRef(null)
  const readyRef = useRef(false)
  const wantRef = useRef(false)

  useEffect(() => {
    wantRef.current = recording
    if (!ref.current || !readyRef.current) return
    if (recording) ref.current.injectJavaScript("startRec(); true;")
    else ref.current.injectJavaScript("stopRec(); true;")
  }, [recording])

  return (
    <WebView
      ref={ref}
      source={{ html: RECORDER_HTML, baseUrl: "https://localhost/" }}
      style={recording ? styles.meter : styles.hidden}
      javaScriptEnabled
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      originWhitelist={["*"]}
      onLoadEnd={() => {
        readyRef.current = true
        if (wantRef.current) ref.current?.injectJavaScript("startRec(); true;")
      }}
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data || "{}")
          if (data.started) {
            onStarted?.()
            return
          }
          if (data.ok && data.b64) {
            onRecorded?.({ mime: data.mime || "audio/webm", b64: data.b64 })
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

export function ChatVoiceBubble({
  audioUrl,
  caption,
  isMe,
  playLabel
}) {
  const [playing, setPlaying] = useState(false)
  const html = `<!DOCTYPE html><html><body style="margin:0;background:transparent">
<audio id="a" src="${String(audioUrl || "").replace(/"/g, "")}" preload="auto"></audio>
<script>
document.getElementById("a").onended=function(){window.ReactNativeWebView.postMessage("ended")};
function play(){var a=document.getElementById("a"); a.play(); window.ReactNativeWebView.postMessage("play");}
function pause(){document.getElementById("a").pause();}
</script></body></html>`
  const ref = useRef(null)
  return (
    <View style={styles.voiceBlock}>
      <Pressable
        onPress={() => {
          if (playing) {
            ref.current?.injectJavaScript("pause(); true;")
            setPlaying(false)
          } else {
            ref.current?.injectJavaScript("play(); true;")
          }
        }}
        style={[styles.playBtn, isMe ? styles.playBtnMe : null]}
      >
        <Text style={[styles.playText, isMe ? styles.playTextMe : null]}>
          {playing ? "■" : "▶"} {playLabel}
        </Text>
      </Pressable>
      {caption ? (
        <Text style={[styles.caption, isMe ? styles.captionMe : null]}>{caption}</Text>
      ) : null}
      <WebView
        ref={ref}
        source={{ html, baseUrl: "https://localhost/" }}
        style={styles.hidden}
        javaScriptEnabled
        originWhitelist={["*"]}
        mediaPlaybackRequiresUserAction={false}
        onMessage={(e) => {
          const m = e.nativeEvent.data
          if (m === "play") setPlaying(true)
          if (m === "ended") setPlaying(false)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  hidden: { width: 1, height: 1, opacity: 0.01 },
  meter: { height: 36, width: "100%", opacity: 0.15, marginBottom: 4 },
  voiceBlock: { gap: 6, minWidth: 160 },
  playBtn: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  playBtnMe: { backgroundColor: "rgba(255,255,255,0.22)" },
  playText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  playTextMe: { color: "#fff" },
  caption: { color: "#334155", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  captionMe: { color: "rgba(255,255,255,0.92)" }
})
