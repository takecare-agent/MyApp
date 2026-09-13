import { useEffect, useState } from "react"
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"
import { apiRequest } from "../lib/api"
import { useI18n } from "../i18n/I18nContext"
import { loadAvatarUri, saveAvatarUri, subscribeAvatars } from "../lib/avatarStore"
import { NeoIcon } from "../screens/new_ui/NeoIcons"

function escHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]))
}

function pickHtml(t) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;background:#16181D;font-family:-apple-system,sans-serif;color:#fff}
.wrap{padding:8px 0;display:flex;flex-direction:column;gap:10px;align-items:stretch}
.btn{display:block;text-align:center;background:#12281E;color:#A8E6CF;font-weight:800;padding:14px;border-radius:14px;border:1px solid #10B981}
.ghost{background:#12141A;color:#C5CAD3;border:1px solid rgba(255,255,255,.12)}
input{position:absolute;left:-9999px}
.hint{color:#8E95A3;font-size:12px;text-align:center}
#vp{width:280px;height:280px;margin:0 auto;overflow:hidden;border-radius:20px;background:#0B0D0E;position:relative;touch-action:none;border:1px solid rgba(255,255,255,.1)}
#img{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;user-select:none;-webkit-user-drag:none}
</style></head><body>
<div class="wrap" id="pick">
  <label class="btn">${escHtml(t("avatar.album"))}<input id="alb" type="file" accept="image/*"></label>
  <label class="btn">${escHtml(t("avatar.camera"))}<input id="cam" type="file" accept="image/*" capture="environment"></label>
  <div class="hint">${escHtml(t("avatar.pickHint"))}</div>
</div>
<div class="wrap" id="crop" style="display:none">
  <div id="vp"><img id="img" alt=""></div>
  <div class="hint">${escHtml(t("avatar.cropHint"))}</div>
  <div class="btn" id="ok">${escHtml(t("avatar.cropDone"))}</div>
  <div class="btn ghost" id="back">${escHtml(t("avatar.reselect"))}</div>
</div>
<script>
function send(obj){ window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }
var S=280, img=document.getElementById("img"), vp=document.getElementById("vp");
var natW=0, natH=0, scale=1, tx=0, ty=0, minScale=1;
function apply(){ img.style.transform="translate("+tx+"px,"+ty+"px) scale("+scale+")"; }
function clamp(){
  var w=natW*scale, h=natH*scale;
  if(w<=S) tx=(S-w)/2; else { if(tx>0) tx=0; if(tx+w<S) tx=S-w; }
  if(h<=S) ty=(S-h)/2; else { if(ty>0) ty=0; if(ty+h<S) ty=S-h; }
}
function fit(nw,nh){
  natW=nw; natH=nh; minScale=Math.max(S/nw,S/nh); scale=minScale;
  tx=(S-nw*scale)/2; ty=(S-nh*scale)/2; apply();
}
function startCrop(dataUrl){
  document.getElementById("pick").style.display="none";
  document.getElementById("crop").style.display="flex";
  img.onload=function(){ fit(img.naturalWidth, img.naturalHeight); };
  img.src=dataUrl;
}
function handle(input){
  input.onchange=function(){
    var file=this.files&&this.files[0];
    if(!file){ send({error:"empty"}); return; }
    var reader=new FileReader();
    reader.onerror=function(){ send({error:"read"}); };
    reader.onload=function(){ startCrop(reader.result); };
    reader.readAsDataURL(file);
  };
}
handle(document.getElementById("alb"));
handle(document.getElementById("cam"));
document.getElementById("back").onclick=function(){
  document.getElementById("crop").style.display="none";
  document.getElementById("pick").style.display="flex";
  img.src="";
};
var dragging=false, lastX=0, lastY=0, lastDist=0, lastScale=1, lastTx=0, lastTy=0;
vp.addEventListener("touchstart", function(e){
  if(e.touches.length===1){
    dragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; lastTx=tx; lastTy=ty;
  } else if(e.touches.length===2){
    dragging=false;
    var dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
    lastDist=Math.sqrt(dx*dx+dy*dy); lastScale=scale; lastTx=tx; lastTy=ty;
  }
},{passive:false});
vp.addEventListener("touchmove", function(e){
  e.preventDefault();
  if(e.touches.length===1 && dragging){
    tx=lastTx+(e.touches[0].clientX-lastX);
    ty=lastTy+(e.touches[0].clientY-lastY);
    clamp(); apply();
  } else if(e.touches.length===2){
    var dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
    var dist=Math.sqrt(dx*dx+dy*dy);
    var ns=Math.max(minScale, Math.min(lastScale*(dist/lastDist), minScale*6));
    var cx=S/2, cy=S/2;
    var ix=(cx-lastTx)/lastScale, iy=(cy-lastTy)/lastScale;
    scale=ns; tx=cx-ix*scale; ty=cy-iy*scale;
    clamp(); apply();
  }
},{passive:false});
vp.addEventListener("touchend", function(){ dragging=false; }, {passive:true});
document.getElementById("ok").onclick=function(){
  if(!natW) return;
  var out=512;
  var c=document.createElement("canvas"); c.width=out; c.height=out;
  var ctx=c.getContext("2d");
  var sx=-tx/scale, sy=-ty/scale, sw=S/scale, sh=S/scale;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out, out);
  send({uri:c.toDataURL("image/jpeg",0.88)});
};
</script></body></html>`
}

export function AvatarMark({ email, size = 52, onPress, apiBaseUrl, token, inModal = false }) {
  const [uri, setUri] = useState("")
  useEffect(() => {
    let live = true
    const pull = () => {
      loadAvatarUri(email).then((next) => {
        if (live) setUri(next)
      })
    }
    pull()
    const unsub = subscribeAvatars(pull)
    return () => {
      live = false
      unsub()
    }
  }, [email])

  useEffect(() => {
    if (!email || !apiBaseUrl || !token) return undefined
    let live = true
    apiRequest({
      apiBaseUrl,
      path: `/mobile/avatars/${encodeURIComponent(String(email).trim().toLowerCase())}`,
      token
    })
      .then((data) => {
        const remote = String(data?.dataUrl || "")
        if (!live || !remote) return
        saveAvatarUri(email, remote)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [email, apiBaseUrl, token])

  const inner = uri ? (
    inModal && String(uri).startsWith("data:") ? (
      <WebView
        source={{
          html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=${size},height=${size}"></head><body style="margin:0;background:#16181D"><img src="${String(uri).replace(/"/g, "")}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:cover;display:block"/></body></html>`,
          baseUrl: "https://localhost/"
        }}
        style={{ width: size, height: size, backgroundColor: "#16181D" }}
        scrollEnabled={false}
        pointerEvents="none"
      />
    ) : (
      <Image key={String(uri).slice(-24)} source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    )
  ) : (
    <NeoIcon name="user" size={Math.round(size * 0.5)} color="#FFFFFF" />
  )

  const box = (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
      {inner}
    </View>
  )

  if (!onPress) return box
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {box}
    </Pressable>
  )
}

export function AvatarPickModal({ visible, email, apiBaseUrl, token, onClose }) {
  const { t } = useI18n()
  const [hint, setHint] = useState("")
  if (!visible || !email) return null

  const persist = async (uri) => {
    await saveAvatarUri(email, uri)
    if (apiBaseUrl && token && uri) {
      try {
        await apiRequest({
          apiBaseUrl,
          path: "/mobile/me/avatar",
          method: "PUT",
          token,
          body: { dataUrl: uri }
        })
      } catch {
        setHint(t("avatar.syncPending"))
      }
    }
    onClose()
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.mask}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t("avatar.title")}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          <WebView
            source={{ html: pickHtml(t), baseUrl: "https://localhost/" }}
            style={styles.web}
            javaScriptEnabled
            originWhitelist={["*"]}
            allowFileAccess
            allowFileAccessFromFileURLs
            allowingReadAccessToURL="file://"
            onMessage={(e) => {
              try {
                const data = JSON.parse(e.nativeEvent.data || "{}")
                if (data.uri) persist(data.uri)
                else if (data.error) setHint(t("avatar.pickFail"))
              } catch {
                setHint(t("avatar.pickFail"))
              }
            }}
          />
          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              saveAvatarUri(email, "").then(() => {
                if (apiBaseUrl && token) {
                  apiRequest({
                    apiBaseUrl,
                    path: "/mobile/me/avatar",
                    method: "PUT",
                    token,
                    body: { dataUrl: "" }
                  }).catch(() => {})
                }
                onClose()
              })
            }}
          >
            <Text style={styles.clearText}>{t("avatar.remove")}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>{t("google.cancel")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  ring: {
    backgroundColor: "#16181D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  mask: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,13,14,0.55)" },
  sheet: {
    backgroundColor: "#16181D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 28,
    minHeight: 340
  },
  title: { color: "#FFFFFF", fontWeight: "800", fontSize: 18, marginBottom: 8 },
  hint: { color: "#FBBF24", fontWeight: "700", marginBottom: 8 },
  web: { height: 360, backgroundColor: "#16181D" },
  clearBtn: { alignItems: "center", paddingVertical: 10 },
  clearText: { color: "#FF5C5C", fontWeight: "700" },
  closeBtn: { alignItems: "center", paddingVertical: 8 },
  closeText: { color: "#10B981", fontWeight: "700" }
})
