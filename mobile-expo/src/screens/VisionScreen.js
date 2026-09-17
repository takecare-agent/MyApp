import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native"
import { WebView } from "react-native-webview"
import { apiRequest } from "../lib/api"
import { colors, night } from "./new_ui/tokens"
import { GlassCircle, IconExpand } from "./new_ui/GlassCircle"
import { NeoIcon } from "./new_ui/NeoIcons"
import { Button } from "./new_ui/ui/kit"

const HEALTH_POLL_MS = 2000   // 每 2 秒問一次影像服務目前狀態
const HISTORY_POLL_MS = 3000  // 每 3 秒自動刷新歷史紀錄（跌倒後較快看到新資料）
const PUSH_GRACE_MS = 4000    // 等辨識服務主動回報多久，逾時才由 App 補寫
const CONTROLS_HIDE_MS = 4000 // 點畫面喚醒 ±10／時間軸，閒置後收合

// 由 apiBaseUrl 推導影像服務網址（把後端 port 換成影像服務的 8000）
function toServiceUrl(apiBaseUrl, path) {
  const raw = String(apiBaseUrl || "").replace(/\/__takecare_api\/?$/, "").replace(/\/+$/, "")
  if (!raw) return ""
  const match = raw.match(/^(https?):\/\/([^/:]+)/)
  if (match) return `${match[1]}://${match[2]}:8000${path}`
  const withPort = /:\d+$/.test(raw) ? raw.replace(/:\d+$/, ":8000") : `${raw}:8000`
  return `${withPort}${path}`
}

function streamPageHtml(streamUrl) {
  const src = String(streamUrl || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  const raw = String(streamUrl || "")
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}
body{display:flex;align-items:center;justify-content:center}
img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center;display:block}
</style></head><body>
<img id="s" src="${src}" alt="">
<script>
var src=${JSON.stringify(raw)};
var img=document.getElementById("s");
function ping(){
  try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage("tap"); } catch (e) {}
}
img.addEventListener("error", function () {
  img.style.visibility = "hidden";
  setTimeout(function () {
    img.style.visibility = "visible";
    img.src = src + (src.indexOf("?") >= 0 ? "&" : "?") + "r=" + Date.now();
  }, 700);
});
document.addEventListener("touchend", ping, true);
document.addEventListener("click", function (e) {
  if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
  ping();
}, true);
</script>
</body></html>`
}

function StreamMjpeg({ src, playerKey, onTap }) {
  const webRef = useRef(null)
  useEffect(() => {
    return () => {
      try {
        webRef.current?.injectJavaScript?.(`
          var img = document.querySelector("img");
          if (img) img.src = "about:blank";
          true;
        `)
        webRef.current?.stopLoading?.()
      } catch {
        // ignore
      }
    }
  }, [])
  if (!src) return <View style={styles.webview} />
  return (
    <WebView
      ref={webRef}
      key={playerKey}
      source={{
        html: streamPageHtml(src),
        baseUrl: String(src).replace(/\/(stream|playback).*$/, "/")
      }}
      style={[styles.webview, styles.webviewLayer]}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      nestedScrollEnabled={false}
      javaScriptEnabled
      originWhitelist={["*"]}
      mixedContentMode="always"
      androidLayerType="hardware"
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      automaticallyAdjustContentInsets={false}
      cacheEnabled={false}
      onMessage={() => {
        if (onTap) onTap()
      }}
    />
  )
}

function formatScrubTime(ts) {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ""
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

function toMs(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n > 1e12 ? n : n * 1000
}

function startOfDayMs(now = Date.now(), offsetDays = 0) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (offsetDays) d.setDate(d.getDate() + offsetDays)
  return d.getTime()
}

function startOfTodayMs(now = Date.now()) {
  return startOfDayMs(now, 0)
}

const AXIS_DAY_SPAN = 14

function dayOffsetFromMs(at, now = Date.now()) {
  const today0 = startOfDayMs(now, 0)
  const target0 = startOfDayMs(at, 0)
  const diff = Math.round((target0 - today0) / (24 * 60 * 60 * 1000))
  if (!Number.isFinite(diff)) return 0
  return Math.min(0, Math.max(-AXIS_DAY_SPAN, diff))
}

function formatAxisHm(ts) {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ""
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

function axisTickMarks(from, to) {
  const ticks = []
  const cursor = new Date(from)
  cursor.setSeconds(0, 0)
  const leftover = cursor.getMinutes() % 5
  if (leftover) cursor.setMinutes(cursor.getMinutes() - leftover)
  let ts = cursor.getTime()
  if (ts < from) ts += 5 * 60 * 1000
  const step = 5 * 60 * 1000
  while (ts < to) {
    const mins = new Date(ts).getMinutes()
    const major = mins % 30 === 0
    ticks.push({ ts, major, label: major ? formatAxisHm(ts) : "" })
    ts += step
  }
  return ticks
}

function dayTitle(offset, todayLabel, yesterdayLabel) {
  if (offset === 0) return todayLabel
  if (offset === -1) return yesterdayLabel
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function sessionBounds(session, fallbackEnd) {
  const start = toMs(session?.startedAt)
  const end = session?.endedAt ? toMs(session.endedAt) : (fallbackEnd || Date.now())
  return { start, end }
}

function clipInterval(start, end, from, to) {
  const a = Math.max(start, from)
  const b = Math.min(end, to)
  return b > a ? { start: a, end: b } : null
}

function ringSpanList(ringSpansMs, ringStartMs, ringEndMs) {
  const fromHealth = (ringSpansMs || [])
    .map((span) => {
      const start = toMs(span?.start ?? span?.[0])
      const end = toMs(span?.end ?? span?.[1])
      return start > 0 && end > start ? { start, end } : null
    })
    .filter(Boolean)
  if (fromHealth.length) return fromHealth
  return ringStartMs > 0 && ringEndMs > ringStartMs
    ? [{ start: ringStartMs, end: ringEndMs }]
    : []
}

function tsInRing(ts, ringSpansMs, ringStartMs, ringEndMs) {
  return ringSpanList(ringSpansMs, ringStartMs, ringEndMs).some(
    (seg) => ts >= seg.start && ts <= seg.end
  )
}

function playableIntervals({ ringSpansMs, ringStartMs, ringEndMs, from, to }) {
  return ringSpanList(ringSpansMs, ringStartMs, ringEndMs)
    .map((seg) => clipInterval(seg.start, seg.end, from, to))
    .filter(Boolean)
}

function gapKindAt(ts, { sessions, ringSpansMs, ringStartMs, ringEndMs, now }) {
  if (!Number.isFinite(ts) || ts >= now - 400) return null
  if (tsInRing(ts, ringSpansMs, ringStartMs, ringEndMs)) return null
  const inSession = (sessions || []).some((s) => {
    const b = sessionBounds(s, now)
    return ts >= b.start && ts <= b.end
  })
  if (inSession) return "expired"
  return "offline"
}

const LIVE_SNAP_MS = 800
const TICK_SLOT_PX = 26
const TICK_STEP_MS = 5 * 60 * 1000

function eventDotColor(item) {
  if (item?.recordKind === "sos" || String(item?.eventId || "").startsWith("SOS")) return "#d97706"
  const text = String(item?.severity || item?.type || "").toLowerCase()
  if (text.includes("high") || text.includes("critical") || text.includes("danger") || text.includes("fall") || text.includes("跌倒")) {
    return "#b42318"
  }
  return "#98a2b3"
}

function EventStrip({
  records,
  windowStartMs,
  windowEndMs,
  playheadTs,
  onScrub,
  onScrubEnd,
  onLive,
  sessions,
  ringStartMs,
  ringEndMs,
  ringSpansMs,
  liveOnline,
  dayOffset,
  onDayPrev,
  onDayNext,
  todayLabel,
  yesterdayLabel,
  prevDayLabel,
  nextDayLabel,
  docked = false,
  clockLabel,
  goLiveLabel
}) {
  const scrollRef = useRef(null)
  const viewWRef = useRef(0)
  const [viewW, setViewW] = useState(0)
  const draggingRef = useRef(false)
  const ignoreScrollRef = useRef(false)
  const end = Number(windowEndMs) > 0 ? Number(windowEndMs) : Date.now()
  const start = Number(windowStartMs) > 0 && windowStartMs < end
    ? Number(windowStartMs)
    : startOfTodayMs(end)
  const isToday = dayOffset === 0
  const ticks = useMemo(() => axisTickMarks(start, end), [start, end])
  const tick0 = ticks[0]?.ts ?? start
  const cbRef = useRef({ onScrub, onScrubEnd, onLive, start, end, tick0, isToday })
  cbRef.current = { onScrub, onScrubEnd, onLive, start, end, tick0, isToday }

  const tsFromX = (x) => {
    const cur = cbRef.current
    const raw = cur.tick0 + (x / TICK_SLOT_PX) * TICK_STEP_MS
    return Math.min(cur.end, Math.max(cur.start, raw))
  }

  const xFromTs = (ts) => ((ts - tick0) / TICK_STEP_MS) * TICK_SLOT_PX

  const scrollToTs = (ts, animated) => {
    if (!scrollRef.current || viewWRef.current <= 0) return
    ignoreScrollRef.current = true
    scrollRef.current.scrollTo({ x: Math.max(0, xFromTs(ts)), animated: Boolean(animated) })
    setTimeout(() => {
      ignoreScrollRef.current = false
    }, 120)
  }

  const targetTs = playheadTs == null ? end : playheadTs

  useEffect(() => {
    if (viewW <= 0 || draggingRef.current) return undefined
    scrollToTs(targetTs, false)
    return undefined
  }, [viewW, start, dayOffset, tick0])

  useEffect(() => {
    if (viewW <= 0 || draggingRef.current) return undefined
    scrollToTs(targetTs, false)
    return undefined
  }, [targetTs])

  const finishScrub = (x) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const ts = tsFromX(x)
    const cur = cbRef.current
    if (cur.isToday && ts >= cur.end - LIVE_SNAP_MS) {
      cur.onLive()
      return
    }
    cur.onScrubEnd(ts)
  }

  const emitScrub = (x) => {
    if (ignoreScrollRef.current) return
    if (!draggingRef.current) return
    cbRef.current.onScrub(tsFromX(x))
  }

  const title = dayTitle(dayOffset, todayLabel, yesterdayLabel)
  const canPrev = dayOffset > -AXIS_DAY_SPAN
  const canNext = dayOffset < 0
  const clockText = clockLabel || formatScrubTime(targetTs)
  const pad = viewW > 0 ? viewW / 2 : 0
  const playable = useMemo(
    () => playableIntervals({ ringSpansMs, ringStartMs, ringEndMs, from: start, to: end }),
    [ringSpansMs, ringStartMs, ringEndMs, start, end]
  )
  const axisW = Math.max(ticks.length * TICK_SLOT_PX, TICK_SLOT_PX)

  const dayNav = (
    <View style={styles.rulerDayRow}>
      <Pressable
        onPress={canPrev ? onDayPrev : undefined}
        hitSlop={10}
        style={styles.rulerDayBtn}
        accessibilityLabel={prevDayLabel || "前一天"}
      >
        <NeoIcon name="chevron-left" size={18} color={canPrev ? "#8E95A3" : "rgba(142,149,163,0.28)"} />
      </Pressable>
      <Text style={styles.rulerDayLabel}>{title}</Text>
      <Pressable
        onPress={canNext ? onDayNext : undefined}
        hitSlop={10}
        style={styles.rulerDayBtn}
        accessibilityLabel={nextDayLabel || "後一天"}
      >
        <NeoIcon name="chevron-right" size={18} color={canNext ? "#8E95A3" : "rgba(142,149,163,0.28)"} />
      </Pressable>
    </View>
  )

  const tickRow = (
    <View style={[styles.scrubTicks, { width: axisW }]}>
      <View style={[styles.scrubColorRail, { width: axisW }]} pointerEvents="none" />
      {playable.map((seg) => {
        const left = ((seg.start - tick0) / TICK_STEP_MS) * TICK_SLOT_PX
        const width = Math.max(3, ((seg.end - seg.start) / TICK_STEP_MS) * TICK_SLOT_PX)
        return (
          <View
            key={`${seg.start}-${seg.end}`}
            pointerEvents="none"
            style={[styles.scrubColorSeg, { left, width }]}
          />
        )
      })}
      {ticks.map((tick) => (
        <View key={tick.ts} style={styles.scrubTickCol} pointerEvents="none">
          <View style={tick.major ? styles.scrubTickMajor : styles.scrubTickMinor} />
          {tick.major ? (
            <Text style={styles.scrubTickLabel} numberOfLines={1}>{tick.label}</Text>
          ) : (
            <View style={styles.scrubTickLabelSlot} />
          )}
        </View>
      ))}
    </View>
  )

  const scroller = (
    <View
      style={styles.scrubTrack}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        viewWRef.current = w
        setViewW((prev) => (prev === w ? prev : w))
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        scrollEventThrottle={16}
        style={styles.scrubScroll}
        contentContainerStyle={{ paddingHorizontal: pad, alignItems: "flex-start" }}
        onScrollBeginDrag={(e) => {
          ignoreScrollRef.current = false
          draggingRef.current = true
          cbRef.current.onScrub(tsFromX(e.nativeEvent.contentOffset.x))
        }}
        onScroll={(e) => {
          emitScrub(e.nativeEvent.contentOffset.x)
        }}
        onScrollEndDrag={(e) => {
          const vx = Number(e.nativeEvent.velocity?.x) || 0
          if (Math.abs(vx) < 0.08) finishScrub(e.nativeEvent.contentOffset.x)
        }}
        onMomentumScrollEnd={(e) => finishScrub(e.nativeEvent.contentOffset.x)}
      >
        {tickRow}
      </ScrollView>
      <View pointerEvents="none" style={styles.scrubNeedle} />
    </View>
  )

  if (docked) {
    return (
      <View style={styles.scrubDock}>
        {dayNav}
        <Pressable onPress={onLive} hitSlop={8} accessibilityLabel={goLiveLabel || clockLabel || "Live"}>
          <Text style={styles.scrubClock}>{clockText}</Text>
        </Pressable>
        <View style={styles.scrubRow}>
          {scroller}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.rulerDock}>
      {dayNav}
      {scroller}
    </View>
  )
}

function SkipTenButton({ forward, onPress, label }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.skipBtn} accessibilityLabel={label}>
      <View style={[styles.skipArcWrap, forward ? styles.skipArcFwd : null]}>
        <View style={styles.skipArc} />
        <View style={styles.skipArcHead} />
      </View>
      <Text style={styles.skipLabel}>10</Text>
    </Pressable>
  )
}

function NightDock({ overlay, chromeOn }) {
  const o = overlay
  return (
    <View style={styles.nightDock}>
      {chromeOn ? (
        <View style={styles.nightDockSkip}>
          <Button variant="ghost" onPress={() => o.onSkip(-10)} accessibilityLabel={o.skipBackLabel || "倒退 10 秒"}>
            −10
          </Button>
          <Button variant="ghost" onPress={() => o.onSkip(10)} accessibilityLabel={o.skipFwdLabel || "前進 10 秒"}>
            +10
          </Button>
        </View>
      ) : null}
      <EventStrip
        records={o.records}
        windowStartMs={o.windowStartMs}
        windowEndMs={o.windowEndMs}
        playheadTs={o.playheadTs}
        onScrub={o.onScrub}
        onScrubEnd={o.onScrubEnd}
        onLive={o.onGoLive}
        sessions={o.sessions}
        ringStartMs={o.ringStartMs}
        ringEndMs={o.ringEndMs}
        ringSpansMs={o.ringSpansMs}
        liveOnline={o.liveOnline}
        dayOffset={o.dayOffset}
        onDayPrev={o.onDayPrev}
        onDayNext={o.onDayNext}
        todayLabel={o.todayLabel}
        yesterdayLabel={o.yesterdayLabel}
        prevDayLabel={o.prevDayLabel}
        nextDayLabel={o.nextDayLabel}
        docked
        clockLabel={o.replayLabel}
      />
    </View>
  )
}

function OverlayLayer({
  chromeOn,
  onToggleChrome,
  alertBar,
  notLive,
  liveOnline,
  replayLabel,
  offlineLabel,
  onGoLive,
  onReload,
  onFullscreen,
  showFullscreenBtn,
  onExitFullscreen,
  onSkip,
  records,
  windowStartMs,
  windowEndMs,
  playheadTs,
  onScrub,
  onScrubEnd,
  sessions,
  ringStartMs,
  ringEndMs,
  ringSpansMs,
  dayOffset,
  onDayPrev,
  onDayNext,
  todayLabel,
  yesterdayLabel,
  prevDayLabel,
  nextDayLabel,
  chromeLabel,
  skipBackLabel,
  skipFwdLabel,
  nightSkin = false,
  captionTitle = "",
  goLiveLabel,
  fullscreenLabel,
  exitFullscreenLabel
}) {
  const strip = (
    <EventStrip
      records={records}
      windowStartMs={windowStartMs}
      windowEndMs={windowEndMs}
      playheadTs={playheadTs}
      onScrub={onScrub}
      onScrubEnd={onScrubEnd}
      onLive={onGoLive}
      sessions={sessions}
      ringStartMs={ringStartMs}
      ringEndMs={ringEndMs}
      ringSpansMs={ringSpansMs}
      liveOnline={liveOnline}
      dayOffset={dayOffset}
      onDayPrev={onDayPrev}
      onDayNext={onDayNext}
      todayLabel={todayLabel}
      yesterdayLabel={yesterdayLabel}
      prevDayLabel={prevDayLabel}
      nextDayLabel={nextDayLabel}
      goLiveLabel={goLiveLabel}
    />
  )

  if (nightSkin) {
    return (
      <>
        <Pressable style={styles.wakeHit} onPress={onToggleChrome} accessibilityLabel={chromeLabel || "顯示或隱藏控制列"} />
        {alertBar ? (
          <View style={[styles.alertBar, { backgroundColor: alertBar.bg }]} pointerEvents="none">
            <Text style={styles.alertBarText}>{alertBar.text}</Text>
          </View>
        ) : null}
        <View style={styles.nightFabRow} pointerEvents="box-none">
          <GlassCircle
            onPress={showFullscreenBtn ? onFullscreen : onExitFullscreen}
            accessibilityLabel={showFullscreenBtn ? (fullscreenLabel || "Fullscreen") : (exitFullscreenLabel || "Exit")}
            size={36}
          >
            <IconExpand color="#FFFFFF" />
          </GlassCircle>
        </View>
      </>
    )
  }

  return (
    <>
      <Pressable style={styles.wakeHit} onPress={onToggleChrome} accessibilityLabel={chromeLabel || "顯示或隱藏控制列"} />
      {alertBar ? (
        <View style={[styles.alertBar, { backgroundColor: alertBar.bg }]} pointerEvents="none">
          <Text style={styles.alertBarText}>{alertBar.text}</Text>
        </View>
      ) : null}
      <View style={styles.hud} pointerEvents="box-none">
        <Pressable onPress={onGoLive} hitSlop={8} style={styles.hudLeft}>
          <View style={[styles.liveDot, notLive || !liveOnline ? styles.liveDotOff : null]} />
          <Text style={styles.hudText}>
            {notLive ? replayLabel : (liveOnline ? "LIVE" : offlineLabel)}
          </Text>
        </Pressable>
        {notLive ? (
          <Pressable onPress={onGoLive} hitSlop={8} style={styles.livePill}>
            <Text style={styles.livePillText}>LIVE</Text>
          </Pressable>
        ) : null}
      </View>
      {chromeOn ? (
        <>
          <View style={showFullscreenBtn ? styles.ctrlOverlay : styles.ctrlOverlayFull} pointerEvents="box-none">
            {showFullscreenBtn ? (
              <>
                <Pressable onPress={onReload} hitSlop={10} style={styles.ctrlBtn}>
                  <Text style={styles.ctrlGlyph}>{"\u21bb"}</Text>
                </Pressable>
                <Pressable onPress={onFullscreen} hitSlop={10} style={styles.ctrlBtn}>
                  <Text style={styles.ctrlGlyph}>[  ]</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={onExitFullscreen} hitSlop={10} style={styles.ctrlBtn}>
                <Text style={styles.ctrlGlyph}>[  ]</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.skipRow} pointerEvents="box-none">
            <SkipTenButton forward={false} onPress={() => onSkip(-10)} label={skipBackLabel || "倒退 10 秒"} />
            <SkipTenButton forward onPress={() => onSkip(10)} label={skipFwdLabel || "前進 10 秒"} />
          </View>
          {strip}
        </>
      ) : null}
    </>
  )
}

const UI_TEXT = {
  zh: { back: "返回", caregiverTitle: "看護視覺偵測", patientTitle: "長輩視覺偵測", refresh: "重新整理", history: "歷史紀錄", noRecords: "尚無紀錄。", live: "即時影像監控", liveHint: "監視器橫向全畫面，不裁切。", severityFilter: "嚴重度篩選", sevAll: "全部", sevHigh: "高", sevMedium: "中", sevLow: "低", liveStatus: "目前狀態", fallProb: "跌倒機率", statusNormal: "正常監測中", statusSuspected: "疑似摔倒", statusFall: "確認摔倒", statusSuggestDismiss: "已站起，請至活動確認解除", statusOffline: "影像服務未連線", statusSquat: "蹲下（僅紀錄）", statusBend: "彎腰（僅紀錄）", poseStand: "站", poseLie: "躺", autoNote: "系統自動即時監測，偵測到跌倒會自動記錄並通知家屬，無需手動操作。", writeFail: "跌倒紀錄寫入失敗", fullscreen: "打橫觀看", exitFullscreen: "離開全螢幕", rotateHint: "把手機打橫＝監視器全屏", axisToday: "今天", axisYesterday: "昨天", skipBack: "倒退 10 秒", skipFwd: "前進 10 秒", prevDay: "前一天", nextDay: "後一天", toggleChrome: "顯示或隱藏控制列" },
  en: { back: "Back", caregiverTitle: "Caregiver vision", patientTitle: "Elder vision", refresh: "Refresh", history: "History", noRecords: "No records yet.", live: "Live monitoring", liveHint: "Full camera frame, no crop. Rotate for a larger view.", severityFilter: "Severity", sevAll: "All", sevHigh: "High", sevMedium: "Medium", sevLow: "Low", liveStatus: "Status", fallProb: "Fall chance", statusNormal: "Monitoring — normal", statusSuspected: "Possible fall — watching…", statusFall: "⚠️ Fall detected. Family notified", statusSuggestDismiss: "Stand-up detected. Confirm dismiss in Activity.", statusOffline: "Vision service offline", statusSquat: "Low stance detected (logged only, not a fall)", statusBend: "Bend detected (logged only, not a fall)", autoNote: "Falls are logged and the care circle is notified automatically.", writeFail: "Could not save the fall record", fullscreen: "Landscape view", exitFullscreen: "Exit fullscreen", axisToday: "Today", axisYesterday: "Yesterday", skipBack: "Back 10 seconds", skipFwd: "Forward 10 seconds", prevDay: "Previous day", nextDay: "Next day", toggleChrome: "Show or hide controls" },
  id: { back: "Kembali", caregiverTitle: "Deteksi visual pengasuh", patientTitle: "Deteksi visual lansia", refresh: "Muat ulang", history: "Riwayat", noRecords: "Belum ada catatan.", live: "Pemantauan langsung", liveHint: "Bingkai kamera utuh, tidak dipotong.", severityFilter: "Tingkat", sevAll: "Semua", sevHigh: "Tinggi", sevMedium: "Sedang", sevLow: "Rendah", liveStatus: "Status", fallProb: "Peluang jatuh", statusNormal: "Memantau — normal", statusSuspected: "Mungkin jatuh — diamati…", statusFall: "⚠️ Jatuh terdeteksi. Keluarga diberitahu", statusSuggestDismiss: "Berdiri terdeteksi. Konfirmasi di Aktivitas.", statusOffline: "Layanan visual offline", statusSquat: "Postur rendah (hanya dicatat, bukan jatuh)", statusBend: "Membungkuk (hanya dicatat, bukan jatuh)", autoNote: "Jatuh dicatat dan lingkaran perawatan diberitahu otomatis.", writeFail: "Gagal menyimpan catatan jatuh", fullscreen: "Tampilan mendatar", exitFullscreen: "Keluar layar penuh", axisToday: "Hari ini", axisYesterday: "Kemarin", skipBack: "Mundur 10 detik", skipFwd: "Maju 10 detik", prevDay: "Hari sebelumnya", nextDay: "Hari berikutnya", toggleChrome: "Tampilkan atau sembunyikan kontrol" },
  vi: { back: "Quay lại", caregiverTitle: "Giám sát hình ảnh (người chăm)", patientTitle: "Giám sát hình ảnh (người cao tuổi)", refresh: "Làm mới", history: "Lịch sử", noRecords: "Chưa có bản ghi.", live: "Giám sát trực tiếp", liveHint: "Toàn khung hình, không cắt. Xoay ngang để phóng to.", severityFilter: "Mức độ", sevAll: "Tất cả", sevHigh: "Cao", sevMedium: "Trung bình", sevLow: "Thấp", liveStatus: "Trạng thái", fallProb: "Khả năng ngã", statusNormal: "Đang theo dõi — bình thường", statusSuspected: "Có thể ngã — đang quan sát…", statusFall: "⚠️ Phát hiện ngã. Đã báo gia đình", statusSuggestDismiss: "Phát hiện đứng dậy. Xác nhận trong Hoạt động.", statusOffline: "Dịch vụ hình ảnh ngoại tuyến", statusSquat: "Phát hiện tư thế thấp (chỉ ghi, không phải ngã)", statusBend: "Phát hiện cúi (chỉ ghi, không phải ngã)", autoNote: "Ngã được ghi và vòng chăm sóc được báo tự động.", writeFail: "Không ghi được sự kiện ngã", fullscreen: "Xem ngang", exitFullscreen: "Thoát toàn màn hình", axisToday: "Hôm nay", axisYesterday: "Hôm qua", skipBack: "Lùi 10 giây", skipFwd: "Tới 10 giây", prevDay: "Ngày trước", nextDay: "Ngày sau", toggleChrome: "Hiện hoặc ẩn điều khiển" },
  tl: { back: "Bumalik", caregiverTitle: "Vision ng caregiver", patientTitle: "Vision ng nakatatanda", refresh: "I-refresh", history: "Kasaysayan", noRecords: "Wala pang talaan.", live: "Live na pagbantay", liveHint: "Buong frame, hindi tinatabas.", severityFilter: "Antas", sevAll: "Lahat", sevHigh: "Mataas", sevMedium: "Katamtaman", sevLow: "Mababa", liveStatus: "Status", fallProb: "Tsansa ng hulog", statusNormal: "Nagbabantay — normal", statusSuspected: "Posibleng hulog — minamasdan…", statusFall: "⚠️ May hulog. Naabisuhan ang pamilya", statusSuggestDismiss: "Tumayo. Kumpirmahin sa Activity.", statusOffline: "Offline ang vision service", statusSquat: "Mababang tindig (tala lang, hindi hulog)", statusBend: "Yuko (tala lang, hindi hulog)", autoNote: "Ang hulog ay nala-log at inaabisuhan ang care circle.", writeFail: "Hindi naisave ang tala ng hulog", fullscreen: "Landscape", exitFullscreen: "Lumabas sa fullscreen", axisToday: "Ngayon", axisYesterday: "Kahapon", skipBack: "I-rewind ng 10 segundo", skipFwd: "I-forward ng 10 segundo", prevDay: "Nakaraang araw", nextDay: "Susunod na araw", toggleChrome: "Ipakita o itago ang kontrol" },
  th: { back: "กลับ", caregiverTitle: "ตรวจจับภาพผู้ดูแล", patientTitle: "ตรวจจับภาพผู้สูงอายุ", refresh: "รีเฟรช", history: "ประวัติ", noRecords: "ยังไม่มีบันทึก", live: "เฝ้าดูสด", liveHint: "ภาพเต็ม ไม่ครอป หมุนแนวนอนเพื่อขยาย", severityFilter: "ระดับ", sevAll: "ทั้งหมด", sevHigh: "สูง", sevMedium: "กลาง", sevLow: "ต่ำ", liveStatus: "สถานะ", fallProb: "โอกาสล้ม", statusNormal: "กำลังเฝ้า — ปกติ", statusSuspected: "อาจล้ม — กำลังดู…", statusFall: "⚠️ พบการล้ม แจ้งครอบครัวแล้ว", statusSuggestDismiss: "พบการลุกยืน ยืนยันในกิจกรรม", statusOffline: "บริการภาพออฟไลน์", statusSquat: "พบท่าทางต่ำ (บันทึกอย่างเดียว ไม่ใช่ล้ม)", statusBend: "พบการก้ม (บันทึกอย่างเดียว ไม่ใช่ล้ม)", autoNote: "การล้มถูกบันทึกและแจ้งวงการดูแลอัตโนมัติ", writeFail: "บันทึกการล้มไม่สำเร็จ", fullscreen: "ดูแนวนอน", exitFullscreen: "ออกเต็มจอ", axisToday: "วันนี้", axisYesterday: "เมื่อวาน", skipBack: "ถอย 10 วินาที", skipFwd: "ไปหน้า 10 วินาที", prevDay: "วันก่อน", nextDay: "วันถัดไป", toggleChrome: "แสดงหรือซ่อนแถบควบคุม" },
}

export default function VisionScreen({ role, apiBaseUrl, token, uiLang, onBack, embedded = false, seekRef, reloadRef, goLiveRef, fullscreenRef, nightSkin = false }) {
  // 以中文為後備，缺的鍵自動回填，避免半中半英
  const langKey = uiLang || "zh"
  const t = { ...UI_TEXT.zh, ...(UI_TEXT[langKey] || {}) }
  const apiPrefix = role === "caregiver" ? "/caregiver" : role === "family" ? "/family" : "/patient"
  const streamUrl = toServiceUrl(apiBaseUrl, "/stream")
  const healthUrl = toServiceUrl(apiBaseUrl, "/health")

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [severity, setSeverity] = useState("all")
  const [live, setLive] = useState({
    online: false, state: "IDLE", prob: 0, posture: "", playbackStart: 0, playbackEnd: 0, playbackSpans: []
  })
  const [fullscreen, setFullscreen] = useState(false)
  const [streamNonce, setStreamNonce] = useState(0)
  const [dragTs, setDragTs] = useState(null)
  const [playFrom, setPlayFrom] = useState(null)
  const [playheadTs, setPlayheadTs] = useState(null)
  const [seekNonce, setSeekNonce] = useState(0)
  const [chromeOn, setChromeOn] = useState(false)
  const [chromeTick, setChromeTick] = useState(0)
  const [sessions, setSessions] = useState([])
  const [axisEvents, setAxisEvents] = useState([])
  const [gapKind, setGapKind] = useState(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [dayOffset, setDayOffset] = useState(0)
  const dayOffsetRef = useRef(0)
  dayOffsetRef.current = dayOffset
  const pendingSeekRef = useRef(null)
  const windowRef = useRef({ start: 0, end: 0, ringStart: 0, ringEnd: 0, ringSpans: [], sessions: [], liveOnline: false })
  const liveStreamUrl = streamUrl
    ? `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}n=${streamNonce}`
    : ""
  const playbackUrl = toServiceUrl(apiBaseUrl, "/playback")
  const playbackStreamUrl = toServiceUrl(apiBaseUrl, "/playback/stream")
  const ringStartMs = toMs(live.playbackStart)
  const ringEndMs = toMs(live.playbackEnd) || (live.online ? nowMs : 0)
  const ringSpansMs = Array.isArray(live.playbackSpans) ? live.playbackSpans : []
  const windowStartMs = startOfDayMs(nowMs, dayOffset)
  const windowEndMs = dayOffset === 0 ? nowMs : windowStartMs + 24 * 60 * 60 * 1000
  const viewingPastDay = dayOffset !== 0
  windowRef.current = {
    start: windowStartMs,
    end: windowEndMs,
    ringStart: ringStartMs,
    ringEnd: ringEndMs,
    ringSpans: ringSpansMs,
    sessions,
    liveOnline: live.online
  }
  const goLive = useCallback(() => {
    pendingSeekRef.current = null
    setDayOffset(0)
    setDragTs(null)
    setPlayFrom(null)
    setPlayheadTs(null)
    setGapKind(null)
  }, [])
  const lastWakeRef = useRef(0)
  const pokeChrome = useCallback(() => {
    setChromeOn(true)
    setChromeTick((n) => n + 1)
  }, [])
  const toggleChrome = useCallback(() => {
    const now = Date.now()
    if (now - lastWakeRef.current < 280) return
    lastWakeRef.current = now
    setChromeOn((on) => !on)
    setChromeTick((n) => n + 1)
  }, [])
  const shiftDay = useCallback((delta) => {
    pokeChrome()
    setDayOffset((prev) => Math.min(0, Math.max(-AXIS_DAY_SPAN, prev + delta)))
  }, [pokeChrome])
  const dayInitRef = useRef(true)
  const startReplay = useCallback((ts) => {
    const raw = toMs(ts)
    if (!raw) return
    const want = dayOffsetFromMs(raw)
    if (want !== dayOffsetRef.current) {
      pendingSeekRef.current = raw
      setDayOffset(want)
      return
    }
    const dayStart = startOfDayMs(raw, 0)
    const now = Date.now()
    const dayEnd = want === 0 ? now : dayStart + 24 * 60 * 60 * 1000
    let at = raw
    if (at < dayStart) at = dayStart
    if (at > dayEnd) at = dayEnd
    const win = windowRef.current
    const kind = gapKindAt(at, {
      sessions: win.sessions,
      ringSpansMs: win.ringSpans,
      ringStartMs: win.ringStart,
      ringEndMs: win.ringEnd,
      now: want === 0 ? now : dayEnd
    })
    setDragTs(null)
    setPlayheadTs(at)
    if (kind) {
      pendingSeekRef.current = null
      setPlayFrom(null)
      setGapKind(kind)
      return
    }
    setGapKind(null)
    pendingSeekRef.current = null
    setPlayFrom(at)
    setSeekNonce((n) => n + 1)
  }, [])
  useEffect(() => {
    if (dayInitRef.current) {
      dayInitRef.current = false
      return
    }
    setDragTs(null)
    const pending = pendingSeekRef.current
    if (pending != null && dayOffsetFromMs(pending) === dayOffset) {
      startReplay(pending)
      return
    }
    pendingSeekRef.current = null
    setPlayFrom(null)
    setPlayheadTs(null)
    setGapKind(null)
  }, [dayOffset, startReplay])
  useEffect(() => {
    if (!seekRef) return undefined
    seekRef.current = startReplay
    return () => {
      if (seekRef.current === startReplay) seekRef.current = null
    }
  }, [seekRef, startReplay])

  useEffect(() => {
    if (!goLiveRef) return undefined
    goLiveRef.current = goLive
    return () => {
      if (goLiveRef.current === goLive) goLiveRef.current = null
    }
  }, [goLiveRef, goLive])

  useEffect(() => {
    if (seekNonce < 1) return undefined
    const at = pendingSeekRef.current
    if (at == null) return undefined
    pendingSeekRef.current = null
    setPlayFrom(at)
    return undefined
  }, [seekNonce])

  useEffect(() => {
    if (!chromeOn) return undefined
    const id = setTimeout(() => setChromeOn(false), CONTROLS_HIDE_MS)
    return () => clearTimeout(id)
  }, [chromeOn, chromeTick])

  // 用 ref 在輪詢 callback 裡讀到最新值，避免閉包過期
  const severityRef = useRef(severity)
  severityRef.current = severity
  const confirmedLatch = useRef(false)      // 舊版影像服務（無 eventKey）才用的後備 latch
  const loggingRef = useRef(false)
  const handledEventKeyRef = useRef("")     // 這個 eventKey 已經有紀錄了（不論是誰建立的），不用再處理
  const pendingSinceRef = useRef(0)         // 等影像服務主動推播的起始時間；逾時才由 App 補寫

  const loadHistory = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError("")
    }
    try {
      const params = new URLSearchParams({ limit: "100" })
      if (severityRef.current !== "all") params.set("severity", severityRef.current)
      const [visionData, sosData] = await Promise.all([
        apiRequest({
          apiBaseUrl,
          path: `${apiPrefix}/vision/history?${params.toString()}`,
          token
        }),
        apiRequest({
          apiBaseUrl,
          path: `${apiPrefix}/sos/history?limit=30`,
          token
        }).catch(() => ({ records: [] }))
      ])
      const visionRows = Array.isArray(visionData.records) ? visionData.records : []
      const sosRows = (Array.isArray(sosData.records) ? sosData.records : []).map((item) => ({
        ...item,
        recordKind: "sos",
        happenedAt: item.triggeredAt || item.happenedAt
      }))
      setRecords(visionRows)
      setAxisEvents([...visionRows, ...sosRows])
    } catch (loadError) {
      if (!silent) setError(loadError.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [apiBaseUrl, apiPrefix, token])

  const loadSessions = useCallback(async () => {
    try {
      const fromMs = startOfDayMs(Date.now(), dayOffset)
      const from = new Date(fromMs).toISOString()
      const toParam = dayOffset === 0
        ? ""
        : `&to=${encodeURIComponent(new Date(fromMs + 24 * 60 * 60 * 1000).toISOString())}`
      const data = await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/vision/sessions?from=${encodeURIComponent(from)}${toParam}`,
        token
      })
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
    } catch {
      /* 軸仍可用 ring；心跳還沒寫入時不擋監看 */
    }
  }, [apiBaseUrl, apiPrefix, token, dayOffset])

  // 備援寫入一筆紀錄（透過後端，會一併建立家屬警報）；只在影像服務主動推播逾時／舊版無 eventKey 時才呼叫
  const autoLogFall = useCallback(async (healthPayload = {}) => {
    if (loggingRef.current) return
    loggingRef.current = true
    try {
      await apiRequest({
        apiBaseUrl,
        path: `${apiPrefix}/vision/detect`,
        method: "POST",
        token,
        body: {
          frameTag: healthPayload.eventKey || "",
          location: "",
          description: "",
          confirmedByHealth: true,
          confidence: Number(healthPayload.prob) || 0,
          trigger: healthPayload.trigger || ""
        }
      })
      await loadHistory()
    } catch (logError) {
      setError(logError.message || t.writeFail)
    } finally {
      loggingRef.current = false
    }
  }, [apiBaseUrl, apiPrefix, token, loadHistory, t.writeFail])

  // 輪詢影像服務狀態：只用來更新橫幅；寫入紀錄為備援 —
  // 確認跌倒時辨識服務會自己回報後端（App 沒開也會建立警報），
  // 這裡只在等不到回報（data.reported 逾時仍為 false）或舊版沒有 eventKey 時才補寫。
  useEffect(() => {
    if (!healthUrl) return undefined
    let alive = true
    const tick = async () => {
      try {
        const res = await fetch(healthUrl)
        const data = await res.json()
        if (!alive) return
        const st = data.state || "IDLE"
        const eventKey = typeof data.eventKey === "string" ? data.eventKey : ""
        setLive({
          online: true,
          state: st,
          prob: Number(data.prob) || 0,
          posture: String(data.posture || ""),
          playbackStart: Number(data.playbackStart) || 0,
          playbackEnd: Number(data.playbackEnd) || 0,
          playbackSpans: Array.isArray(data.playbackSpans) ? data.playbackSpans : []
        })

        if (st === "CONFIRMED") {
          if (eventKey) {
            if (handledEventKeyRef.current !== eventKey) {
              if (data.reported === true) {
                // 影像服務已主動推播成功，App 只要刷新歷史，不必自己再寫一筆
                handledEventKeyRef.current = eventKey
                pendingSinceRef.current = 0
                loadHistory()
              } else {
                if (!pendingSinceRef.current) pendingSinceRef.current = Date.now()
                if (Date.now() - pendingSinceRef.current >= PUSH_GRACE_MS) {
                  handledEventKeyRef.current = eventKey
                  pendingSinceRef.current = 0
                  autoLogFall({ prob: Number(data.prob) || 0, trigger: data.trigger || "", eventKey })
                }
              }
            }
          } else if (!confirmedLatch.current) {
            // 舊版影像服務（無 eventKey）：維持原本行為，App 自己記錄
            confirmedLatch.current = true
            autoLogFall({ prob: Number(data.prob) || 0, trigger: data.trigger || "" })
          }
        } else {
          confirmedLatch.current = false
          if (!eventKey) {
            handledEventKeyRef.current = ""
            pendingSinceRef.current = 0
          }
        }
      } catch {
        if (alive) setLive(prev => ({ ...prev, online: false }))
      }
    }
    tick()
    const id = setInterval(tick, HEALTH_POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [healthUrl, autoLogFall, loadHistory])

  // 初次載入、切換篩選、定時自動刷新歷史
  useEffect(() => {
    loadHistory()
    loadSessions()
  }, [loadHistory, loadSessions, severity])

  useEffect(() => {
    const id = setInterval(() => loadHistory(true), HISTORY_POLL_MS)
    return () => clearInterval(id)
  }, [loadHistory])

  useEffect(() => {
    const id = setInterval(loadSessions, 15000)
    return () => clearInterval(id)
  }, [loadSessions])

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])

  const handleReload = useCallback(async () => {
    pendingSeekRef.current = null
    setPlayFrom(null)
    setDragTs(null)
    setPlayheadTs(null)
    setGapKind(null)
    setDayOffset(0)
    setStreamNonce((n) => n + 1)
    try {
      const resetUrl = toServiceUrl(apiBaseUrl, "/reset")
      if (resetUrl) await fetch(resetUrl)
    } catch { /* ignore */ }
    loadHistory(true)
    loadSessions()
  }, [apiBaseUrl, loadHistory, loadSessions])

  useEffect(() => {
    if (!reloadRef) return undefined
    reloadRef.current = handleReload
    return () => {
      if (reloadRef.current === handleReload) reloadRef.current = null
    }
  }, [reloadRef, handleReload])

  useEffect(() => {
    if (!fullscreenRef) return undefined
    const open = () => {
      pokeChrome()
      setFullscreen(true)
    }
    fullscreenRef.current = open
    return () => {
      if (fullscreenRef.current === open) fullscreenRef.current = null
    }
  }, [fullscreenRef, pokeChrome])

  useEffect(() => {
    if (playFrom == null || dragTs != null) return undefined
    const origin = playFrom
    const t0 = Date.now()
    const dayEnd = startOfDayMs(origin, 0) + 24 * 60 * 60 * 1000
    const id = setInterval(() => {
      const next = origin + (Date.now() - t0)
      const now = Date.now()
      if (next >= now - 400) {
        goLive()
        return
      }
      if (next >= dayEnd) {
        setPlayFrom(null)
        setPlayheadTs(dayEnd - 1000)
        setGapKind("offline")
        return
      }
      setPlayheadTs(next)
    }, 200)
    return () => clearInterval(id)
  }, [playFrom, dragTs, goLive, seekNonce])

  const skipReplay = useCallback((deltaSec) => {
    const liveNow = Date.now()
    const base = dragTs || playheadTs || playFrom || liveNow
    const next = base + deltaSec * 1000
    if (next >= liveNow - 400) {
      goLive()
      return
    }
    startReplay(next)
  }, [dragTs, playheadTs, playFrom, startReplay, goLive])
  const onSkip = useCallback((deltaSec) => {
    pokeChrome()
    skipReplay(deltaSec)
  }, [pokeChrome, skipReplay])
  const onScrub = useCallback((ts) => {
    pokeChrome()
    setDragTs(ts)
    const win = windowRef.current
    setGapKind(gapKindAt(ts, {
      sessions: win.sessions,
      ringSpansMs: win.ringSpans,
      ringStartMs: win.ringStart,
      ringEndMs: win.ringEnd,
      now: win.end || Date.now()
    }))
  }, [pokeChrome])

  const dragging = dragTs != null
  const replayTs = dragTs != null ? dragTs : (playheadTs != null ? playheadTs : playFrom)
  const activeGap = gapKind
  const replayFreezeSrc = dragging && !activeGap && playbackUrl
    ? `${playbackUrl}?t=${(dragTs / 1000).toFixed(3)}&n=${Math.round(dragTs)}`
    : ""
  const replayStreamSrc = !dragging && !activeGap && playFrom != null && playbackStreamUrl
    ? `${playbackStreamUrl}?from=${(playFrom / 1000).toFixed(3)}&n=${seekNonce}`
    : ""
  const notLive = viewingPastDay || dragging || playFrom != null || Boolean(activeGap && replayTs != null)
  const playerSrc = activeGap || (viewingPastDay && !replayStreamSrc)
    ? ""
    : (replayStreamSrc || liveStreamUrl)
  const playerKey = `wv-${seekNonce}-${replayStreamSrc || "live"}`

  const alertBar = live.online && (live.state === "CONFIRMED" || live.state === "SUSPECTED")
    ? {
        text: live.state === "CONFIRMED" ? t.statusFall : t.statusSuspected,
        bg: live.state === "CONFIRMED" ? "#e5484d" : "#f59e0b"
      }
    : null

  const overlayProps = {
    chromeOn,
    onToggleChrome: toggleChrome,
    alertBar,
    notLive,
    liveOnline: live.online,
    replayLabel: formatScrubTime(replayTs != null ? replayTs : (viewingPastDay ? windowEndMs : Date.now())),
    offlineLabel: t.statusOffline,
    onGoLive: goLive,
    onReload: handleReload,
    onFullscreen: () => {
      pokeChrome()
      setFullscreen(true)
    },
    onExitFullscreen: () => setFullscreen(false),
    onSkip,
    records: axisEvents,
    windowStartMs,
    windowEndMs,
    playheadTs: replayTs,
    onScrub,
    onScrubEnd: startReplay,
    sessions,
    ringStartMs,
    ringEndMs,
    ringSpansMs,
    dayOffset,
    onDayPrev: () => shiftDay(-1),
    onDayNext: () => shiftDay(1),
    todayLabel: t.axisToday || "今天",
    yesterdayLabel: t.axisYesterday || "昨天",
    prevDayLabel: t.prevDay || "前一天",
    nextDayLabel: t.nextDay || "後一天",
    chromeLabel: t.toggleChrome || "顯示或隱藏控制列",
    skipBackLabel: t.skipBack || "倒退 10 秒",
    skipFwdLabel: t.skipFwd || "前進 10 秒",
    goLiveLabel: t.live || "Live",
    fullscreenLabel: t.fullscreen,
    exitFullscreenLabel: t.exitFullscreen,
    nightSkin,
    captionTitle: t.live || "即時監看"
  }

  const stage = (
    <View style={[styles.liveCard, nightSkin && embedded ? styles.liveCardNight : null]}>
      {liveStreamUrl ? (
        <View style={styles.liveBox}>
          <StreamMjpeg src={playerSrc} playerKey={playerKey} onTap={toggleChrome} />
          {dragging && replayFreezeSrc ? (
            <Image source={{ uri: replayFreezeSrc }} style={styles.playbackFreeze} resizeMode="contain" />
          ) : null}
          <OverlayLayer {...overlayProps} showFullscreenBtn />
          {nightSkin ? <View pointerEvents="none" style={styles.liveRoundFrame} /> : null}
        </View>
      ) : (
        <View style={[styles.liveBox, styles.offlineBox]} />
      )}
    </View>
  )

  return (
    <View style={[
      styles.root,
      embedded ? styles.rootEmbedded : null,
      nightSkin && embedded ? styles.rootEmbeddedNight : null
    ]}>
      {nightSkin && embedded ? (
        <View style={styles.liveCardNight}>
          {liveStreamUrl ? (
            <View style={styles.liveBox}>
              <StreamMjpeg src={playerSrc} playerKey={playerKey} onTap={toggleChrome} />
              {dragging && replayFreezeSrc ? (
                <Image source={{ uri: replayFreezeSrc }} style={styles.playbackFreeze} resizeMode="contain" />
              ) : null}
              <OverlayLayer {...overlayProps} showFullscreenBtn />
              <View pointerEvents="none" style={styles.liveVeil} />
              <View pointerEvents="none" style={styles.liveRoundFrame} />
            </View>
          ) : (
            <View style={[styles.liveBox, styles.offlineBox]} />
          )}
        </View>
      ) : stage}

      {nightSkin && embedded ? <NightDock overlay={overlayProps} chromeOn={chromeOn} /> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <StatusBar hidden />
        <View style={styles.fullRoot}>
            <StreamMjpeg src={playerSrc} playerKey={`full-${playerKey}`} onTap={toggleChrome} />
            {dragging && replayFreezeSrc ? (
              <Image source={{ uri: replayFreezeSrc }} style={styles.playbackFreeze} resizeMode="contain" />
            ) : null}
          <OverlayLayer {...overlayProps} showFullscreenBtn={false} />
        </View>
      </Modal>
    </View>
  )
}


const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    gap: 0
  },
  rootEmbedded: {
    flex: 0,
    width: "100%",
    padding: 0,
    backgroundColor: "#000"
  },
  rootEmbeddedNight: {
    backgroundColor: night.bg
  },
  liveCard: {
    backgroundColor: "#000",
    overflow: "hidden"
  },
  liveCardNight: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: "transparent"
  },
  liveBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    borderRadius: 24,
    borderCurve: "continuous",
    overflow: "hidden"
  },
  liveRoundFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    zIndex: 6
  },
  liveVeil: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "42%",
    zIndex: 2,
    experimental_backgroundImage: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.35))"
  },
  alertBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 2,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  alertBarText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center"
  },
  hud: {
    position: "absolute",
    left: 8,
    top: 8,
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14
  },
  hudLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  nightHud: {
    position: "absolute",
    left: 10,
    top: 10,
    zIndex: 5
  },
  nightDock: {
    marginHorizontal: 8,
    marginTop: 10,
    marginBottom: 4
  },
  nightClockFace: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    fontFamily: "Menlo",
    letterSpacing: 1.2,
    marginBottom: 8
  },
  nightDockCard: {
    marginHorizontal: 16,
    marginTop: 10
  },
  nightDockContent: {
    padding: 16,
    gap: 12
  },
  nightDockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  nightDockMeta: {
    flex: 1,
    gap: 2
  },
  nightDockActions: {
    flexDirection: "row",
    gap: 8
  },
  nightDockSkip: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4
  },
  nightCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    minHeight: 64,
    justifyContent: "flex-end"
  },
  nightScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11,13,16,0.42)"
  },
  nightCaptionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingRight: 72,
    paddingBottom: 12,
    gap: 8
  },
  nightCaptionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700"
  },
  nightCaptionTime: {
    color: "#8E95A3",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  nightFabRow: {
    position: "absolute",
    right: 12,
    bottom: 14,
    zIndex: 6,
    flexDirection: "row",
    gap: 10
  },
  nightFabRowUp: {
    bottom: 70
  },
  nightSkipRow: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 70,
    zIndex: 6,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  nightSkipText: {
    color: "#F4F1EA",
    fontSize: 12,
    fontWeight: "800"
  },
  hudNight: {
    backgroundColor: "rgba(11,13,16,0.62)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e5484d"
  },
  liveDotOn: {
    backgroundColor: night.live
  },
  liveDotOff: {
    backgroundColor: "#6b7280"
  },
  hudText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 11
  },
  hudTextNight: {
    letterSpacing: 0.5
  },
  livePill: {
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  livePillNight: {
    borderColor: night.live,
    backgroundColor: "rgba(16,185,129,0.16)"
  },
  livePillText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 10
  },
  livePillTextNight: {
    color: night.live
  },
  ctrlOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 3,
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
    overflow: "hidden"
  },
  ctrlOverlayFull: {
    position: "absolute",
    top: 48,
    right: 16,
    zIndex: 3,
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
    overflow: "hidden"
  },
  ctrlBtn: {
    minWidth: 40,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  ctrlGlyph: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16
  },
  rulerDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    height: 62,
    backgroundColor: "transparent"
  },
  rulerDockInFlow: {
    position: "relative",
    bottom: 0,
    height: 68,
    marginHorizontal: 0,
    marginBottom: 0
  },
  scrubDock: {
    minHeight: 92,
    width: "100%",
    paddingHorizontal: 16,
    justifyContent: "center"
  },
  scrubClock: {
    color: "#FFFFFF",
    fontFamily: "Menlo",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1.2,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    marginBottom: 4
  },
  scrubRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center"
  },
  scrubTrack: {
    flex: 1,
    height: 40,
    justifyContent: "center",
    overflow: "visible"
  },
  scrubScroll: {
    flex: 1,
    height: 40
  },
  scrubColorRail: {
    position: "absolute",
    left: 0,
    top: 18,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2
  },
  scrubColorSeg: {
    position: "absolute",
    top: 16,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22D3EE"
  },
  scrubTicks: {
    flexDirection: "row",
    alignItems: "flex-start",
    height: 40
  },
  scrubTickCol: {
    width: 26,
    alignItems: "center",
    overflow: "visible"
  },
  scrubTickMinor: {
    width: 1,
    height: 10,
    backgroundColor: "rgba(255,255,255,0.2)"
  },
  scrubTickMajor: {
    width: 1.5,
    height: 16,
    backgroundColor: "rgba(255,255,255,0.5)"
  },
  scrubTickLabel: {
    marginTop: 2,
    width: 26,
    fontSize: 8,
    lineHeight: 10,
    fontFamily: "Menlo",
    color: "#8E95A3",
    fontVariant: ["tabular-nums"],
    textAlign: "center"
  },
  scrubTickLabelSlot: {
    height: 12
  },
  scrubNeedle: {
    position: "absolute",
    left: "50%",
    marginLeft: -1,
    top: 6,
    width: 2,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#10B981",
    zIndex: 8
  },
  rulerDayRow: {
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    zIndex: 7
  },
  rulerDayBtn: {
    minWidth: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  rulerDayArrow: {
    fontSize: 16,
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    lineHeight: 20
  },
  rulerDayMuted: {
    color: "rgba(255,255,255,0.28)"
  },
  rulerDayLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    minWidth: 36,
    textAlign: "center"
  },
  rulerScroll: {
    height: 40
  },
  rulerScrollNight: {
    height: 40
  },
  rulerInner: {
    height: 40,
    position: "relative"
  },
  rulerInnerNight: {
    height: 40
  },
  rulerLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 16,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.14)"
  },
  rulerTick: {
    position: "absolute",
    top: 18,
    width: 1,
    height: 5,
    marginLeft: -0.5,
    backgroundColor: "rgba(255,255,255,0.28)"
  },
  rulerTickMajor: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.5)"
  },
  rulerTickNight: {
    top: 16,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.2)"
  },
  rulerTickNightMajor: {
    height: 14,
    backgroundColor: "rgba(255,255,255,0.4)"
  },
  rulerLabelNight: {
    position: "absolute",
    top: 2,
    width: 36,
    marginLeft: -18,
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.45)",
    textAlign: "center"
  },
  rulerLabel: {
    position: "absolute",
    top: 2,
    width: 36,
    marginLeft: -18,
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.78)",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    textAlign: "center"
  },
  rulerPlayable: {
    position: "absolute",
    top: 28,
    height: 6,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.88)"
  },
  rulerPlayableNight: {
    top: 8,
    height: 12,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.92)",
    boxShadow: "0 0 10px rgba(255,255,255,0.35)"
  },
  rulerEvent: {
    position: "absolute",
    top: 26,
    width: 3,
    height: 10,
    borderRadius: 1,
    marginLeft: -1.5
  },
  rulerEventNight: {
    top: 11,
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3
  },
  rulerHead: {
    position: "absolute",
    top: 24,
    bottom: 2,
    left: "50%",
    width: 1.5,
    marginLeft: -0.75,
    backgroundColor: "rgba(255,255,255,0.95)",
    zIndex: 6
  },
  rulerHeadNight: {
    top: "50%",
    marginTop: -12,
    bottom: undefined,
    height: 24,
    width: 2,
    marginLeft: -1,
    borderRadius: 999,
    backgroundColor: "#10B981",
    boxShadow: "0 0 10px rgba(16,185,129,0.85)"
  },
  skipRow: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 66,
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  skipBtn: {
    minWidth: 40,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: "rgba(11,13,16,0.45)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 8
  },
  skipArcWrap: {
    width: 18,
    height: 18,
    marginRight: 2
  },
  skipArcFwd: {
    transform: [{ scaleX: -1 }]
  },
  skipArc: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#fff",
    borderLeftColor: "transparent"
  },
  skipArcHead: {
    position: "absolute",
    top: 0,
    left: 1,
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderRightWidth: 6,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "#fff"
  },
  skipLabel: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
    fontWeight: "700"
  },
  webview: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000"
  },
  webviewLayer: {
    opacity: 0.99
  },
  wakeHit: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1
  },
  playbackFreeze: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: "#000"
  },
  offlineBox: {
    backgroundColor: "#111"
  },
  fullRoot: {
    flex: 1,
    backgroundColor: "#000"
  },
  fullExit: {
    position: "absolute",
    top: 48,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  fullLivePill: {
    position: "absolute",
    top: 52,
    left: 16,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  error: {
    color: "#b42318",
    paddingHorizontal: 12,
    paddingVertical: 8
  }
})

