let pipePromise = null

function getPipeline() {
  if (!pipePromise) {
    pipePromise = import("@xenova/transformers").then(async ({ pipeline, env }) => {
      env.allowRemoteModels = true
      console.log("[whisper] loading Xenova/whisper-small …")
      const pipe = await pipeline("automatic-speech-recognition", "Xenova/whisper-small")
      console.log("[whisper] ready")
      return pipe
    }).catch((err) => {
      console.log("[whisper] load fail:", err.message)
      pipePromise = null
      throw err
    })
  }
  return pipePromise
}

function pcmFromWav(buffer) {
  if (!buffer || buffer.length < 44) return null
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null
  let offset = 12
  let channels = 1
  let rate = 16000
  let bits = 16
  let data = null
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    if (id === "fmt ") {
      channels = buffer.readUInt16LE(start + 2)
      rate = buffer.readUInt32LE(start + 4)
      bits = buffer.readUInt16LE(start + 14)
    } else if (id === "data") {
      data = buffer.subarray(start, Math.min(start + size, buffer.length))
      break
    }
    offset = start + size + (size % 2)
  }
  if (!data || bits !== 16) return null
  const samples = new Float32Array(Math.floor(data.length / 2 / channels))
  let peak = 0
  let sum = 0
  for (let i = 0, s = 0; i + 1 < data.length && s < samples.length; i += 2 * channels, s += 1) {
    const v = data.readInt16LE(i)
    const f = Math.max(-1, Math.min(1, v / 32768))
    samples[s] = f
    peak = Math.max(peak, Math.abs(f))
    sum += f * f
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length))
  const gPeak = peak > 0.02 ? Math.min(3.2, 0.72 / peak) : 1
  const gRms = rms > 0.008 ? Math.min(3.2, 0.08 / rms) : 1
  const g = Math.min(gPeak, gRms)
  if (g > 1.05) {
    for (let s = 0; s < samples.length; s += 1) {
      samples[s] = Math.max(-1, Math.min(1, samples[s] * g))
    }
  }
  return { samples, rate }
}

function resampleTo16k(samples, rate) {
  const from = Number(rate) || 16000
  if (!samples?.length) return samples
  if (from === 16000) return samples
  const ratio = from / 16000
  const len = Math.max(1, Math.floor(samples.length / ratio))
  const out = new Float32Array(len)
  for (let i = 0; i < len; i += 1) {
    const x = i * ratio
    const i0 = Math.min(samples.length - 1, Math.floor(x))
    const i1 = Math.min(samples.length - 1, i0 + 1)
    const t = x - i0
    out[i] = samples[i0] * (1 - t) + samples[i1] * t
  }
  return out
}

function wavDurationSec(buffer) {
  const pcm = pcmFromWav(buffer)
  if (!pcm?.samples?.length || !pcm.rate) return 0
  return Math.round((pcm.samples.length / pcm.rate) * 10) / 10
}

function whisperLang(hint) {
  const raw = String(hint || "zh").toLowerCase()
  if (raw.startsWith("zh") || raw.includes("chinese")) return "chinese"
  if (raw.startsWith("vi") || raw.includes("viet")) return "vietnamese"
  if (raw.startsWith("en") || raw.includes("english")) return "english"
  if (raw.startsWith("id") || raw.includes("indo")) return "indonesian"
  if (raw.startsWith("th") || raw.includes("thai")) return "thai"
  if (raw.startsWith("tl") || raw.startsWith("fil") || raw.includes("tagalog") || raw.includes("philip")) return "tl"
  return "chinese"
}

function appLangFromWhisperName(name) {
  const raw = String(name || "").toLowerCase()
  if (!raw) return ""
  if (raw.includes("chinese") || raw === "zh" || raw.startsWith("zh")) return "zh"
  if (raw.includes("viet") || raw === "vi") return "vi"
  if (raw.includes("english") || raw === "en") return "en"
  if (raw.includes("indo") || raw === "id") return "id"
  if (raw.includes("thai") || raw === "th") return "th"
  if (raw.includes("tagalog") || raw === "tl" || raw.startsWith("fil") || raw.includes("philip")) return "tl"
  return ""
}

function appLangFromHint(hint) {
  const raw = String(hint || "").toLowerCase()
  if (!raw) return ""
  if (raw.startsWith("fil") || raw.startsWith("tl") || raw.includes("tagalog")) return "tl"
  return raw.slice(0, 2)
}

function detectLangFromText(text) {
  const s = String(text || "")
  if (/[\u4e00-\u9fff]/.test(s)) return "zh"
  if (/[ăâêôơưđĂÂÊÔƠƯĐáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(s)) return "vi"
  if (/[\u0e00-\u0e7f]/.test(s)) return "th"
  if (/[a-zA-Z]/.test(s)) return "en"
  return "zh"
}

function padSilence(samples, rate, ms) {
  const n = Math.max(0, Math.floor((Number(rate) || 16000) * (Number(ms) || 0) / 1000))
  if (!n || !samples?.length) return samples
  const out = new Float32Array(samples.length + n * 2)
  out.set(samples, n)
  return out
}

function textFromWhisperResult(result) {
  if (Array.isArray(result?.chunks) && result.chunks.length) {
    const joined = result.chunks.map((c) => String(c?.text || "").trim()).filter(Boolean).join(" ")
    if (joined) return joined.trim()
  }
  return String(result?.text || "").trim()
}

async function transcribeWavBuffer(buffer, languageHint) {
  const pcm = pcmFromWav(buffer)
  if (!pcm?.samples?.length) return { text: "", language: "" }
  const samples = padSilence(new Float32Array(resampleTo16k(pcm.samples, pcm.rate)), 16000, 400)
  let peak = 0
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]))
  if (peak < 0.003) {
    console.log("[whisper] skip silence peak=", peak.toFixed(4), "sec=", (samples.length / 16000).toFixed(1))
    return { text: "", language: "" }
  }
  const pipe = await getPipeline()
  const sec = samples.length / 16000
  const longForm = sec >= 12
  const run = async (opts) => {
    const result = await pipe(samples, {
      task: "transcribe",
      return_timestamps: longForm,
      ...(longForm ? { chunk_length_s: 30, stride_length_s: 5 } : {}),
      ...opts
    })
    return {
      text: textFromWhisperResult(result),
      language: appLangFromWhisperName(result?.language || result?.lang)
    }
  }
  // 有指定說話語就鎖模型（準、快）；沒有才自動判
  let out = languageHint
    ? await run({ language: whisperLang(languageHint) })
    : await run({})
  if (!out.text && languageHint) out = await run({})
  const language = languageHint
    ? (appLangFromHint(languageHint) || detectLangFromText(out.text))
    : (out.language || detectLangFromText(out.text))
  if (out.text) console.log("[whisper] sec=", sec.toFixed(1), "lang=", language, "text=", out.text.slice(0, 80))
  return { text: out.text, language }
}

function warmupWhisper() {
  return getPipeline().catch((err) => {
    console.log("[whisper] warmup skip:", err.message)
  })
}

module.exports = { transcribeWavBuffer, warmupWhisper, pcmFromWav, wavDurationSec, detectLangFromText }
