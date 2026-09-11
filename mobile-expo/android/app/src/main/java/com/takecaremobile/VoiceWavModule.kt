package com.takecaremobile

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs
import kotlin.math.max

/** 系統 AudioRecord → 16kHz WAV；回放走 AudioTrack（華為 WebView/MediaPlayer 播 WAV 常沒聲）。 */
class VoiceWavModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val lock = Any()
  private var recorder: AudioRecord? = null
  private var worker: Thread? = null
  private val running = AtomicBoolean(false)
  private val pcm = ByteArrayOutputStream()
  private var captureRate = SAMPLE_RATE

  private val playLock = Any()
  private var track: AudioTrack? = null
  private var mediaPlayer: MediaPlayer? = null
  private var playThread: Thread? = null
  private val playing = AtomicBoolean(false)
  private val playSeq = AtomicInteger(0)

  override fun getName() = "VoiceWav"

  private fun discardCaptureLocked() {
    running.set(false)
    val rec = recorder
    recorder = null
    val th = worker
    worker = null
    try { rec?.stop() } catch (_: Exception) {}
    try { rec?.release() } catch (_: Exception) {}
    try { th?.join(800) } catch (_: Exception) {}
    pcm.reset()
  }

  @ReactMethod
  fun start(promise: Promise) {
    synchronized(lock) {
      if (running.get()) discardCaptureLocked()
      val opened = try {
        unmuteMic()
        openRecorder()
      } catch (e: SecurityException) {
        promise.reject("NO_PERM", e.message, e)
        return
      } catch (e: Exception) {
        promise.reject("NO_MIC", e.message, e)
        return
      }
      if (opened == null) {
        promise.reject("NO_MIC", "AudioRecord not initialized")
        return
      }
      val rec = opened.first
      captureRate = opened.second
      pcm.reset()
      recorder = rec
      running.set(true)
      rec.startRecording()
      if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        running.set(false)
        rec.release()
        recorder = null
        promise.reject("NO_MIC", "AudioRecord not recording")
        return
      }
      val bufSize = max(rec.minBufferSizeHint(), 2048)
      worker = Thread({
        val buf = ByteArray(bufSize)
        while (running.get()) {
          val n = rec.read(buf, 0, buf.size)
          if (n > 0) {
            synchronized(pcm) { pcm.write(buf, 0, n) }
          }
        }
      }, "VoiceWav").also { it.start() }
      Log.i(TAG, "start rate=$captureRate")
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    synchronized(lock) {
      val wasRunning = running.get()
      running.set(false)
      val rec = recorder
      recorder = null
      val th = worker
      worker = null
      try { rec?.stop() } catch (_: Exception) {}
      try { rec?.release() } catch (_: Exception) {}
      try { th?.join(1500) } catch (_: Exception) {}
      val raw = synchronized(pcm) { pcm.toByteArray() }
      pcm.reset()
      if (!wasRunning && raw.isEmpty()) {
        promise.resolve(null)
        return
      }
      val rate = if (captureRate > 0) captureRate else SAMPLE_RATE
      val pcm16 = downsamplePcm16(raw, rate, SAMPLE_RATE)
      val peak = peakAbs(pcm16)
      var durationSec = pcm16.size / (SAMPLE_RATE * 2.0)
      Log.i(TAG, "stop bytes=${pcm16.size} peak=$peak sec=${"%.1f".format(durationSec)}")
      if (pcm16.size < MIN_SPEECH_BYTES) {
        promise.reject("TOO_SHORT", "recording too short")
        return
      }
      if (peak < 80) {
        promise.reject("SILENCE", "no sound")
        return
      }
      val padded = padPcm(pcm16, PAD_TO_BYTES)
      durationSec = padded.size / (SAMPLE_RATE * 2.0)
      val wav = pcmToWav(padded, SAMPLE_RATE)
      val map = Arguments.createMap()
      map.putString("mime", "audio/wav")
      map.putString("b64", Base64.encodeToString(wav, Base64.NO_WRAP))
      map.putDouble("durationSec", durationSec)
      unmuteMic()
      promise.resolve(map)
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    synchronized(lock) {
      discardCaptureLocked()
      unmuteMic()
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun snapshot(promise: Promise) {
    if (!running.get()) {
      promise.resolve(null)
      return
    }
    val raw = synchronized(pcm) { pcm.toByteArray() }
    val rate = if (captureRate > 0) captureRate else SAMPLE_RATE
    val pcm16 = downsamplePcm16(raw, rate, SAMPLE_RATE)
    if (pcm16.size < MIN_SPEECH_BYTES) {
      promise.resolve(null)
      return
    }
    val wav = pcmToWav(pcm16, SAMPLE_RATE)
    val map = Arguments.createMap()
    map.putString("mime", "audio/wav")
    map.putString("b64", Base64.encodeToString(wav, Base64.NO_WRAP))
    promise.resolve(map)
  }

  @ReactMethod
  fun playWav(b64: String, promise: Promise) {
    stopPlayback()
    val seq = playSeq.incrementAndGet()
    playing.set(true)
    playThread = Thread({
      try {
        val wav = Base64.decode(b64, Base64.DEFAULT)
        playDecoded(wav, seq, promise)
      } catch (e: Exception) {
        if (seq == playSeq.get()) {
          playing.set(false)
          try { promise.reject("PLAY", e.message, e) } catch (_: Exception) {}
          emitEnded()
        }
      }
    }, "VoiceWavPlay").also { it.start() }
  }

  @ReactMethod
  fun addListener(eventName: String?) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  @ReactMethod
  fun playUrl(url: String, promise: Promise) {
    stopPlayback()
    val src = url.trim()
    if (src.isEmpty()) {
      promise.reject("NO_URL", "empty")
      return
    }
    val seq = playSeq.incrementAndGet()
    playing.set(true)
    playThread = Thread({
      try {
        val bytes = download(src)
        if (seq != playSeq.get()) return@Thread
        val parsed = parseWavPcm(bytes)
        if (parsed == null) {
          if (seq == playSeq.get()) {
            playing.set(false)
            promise.reject("BAD_WAV", "not pcm wav")
            emitEnded()
          }
          return@Thread
        }
        if (seq != playSeq.get()) return@Thread
        emitStarted(src)
        promise.resolve(true)
        playPcm(parsed.first, parsed.second, seq)
      } catch (e: Exception) {
        if (seq == playSeq.get()) {
          playing.set(false)
          try { promise.reject("PLAY", e.message, e) } catch (_: Exception) {}
          emitEnded()
        }
      }
    }, "VoiceWavPlay").also { it.start() }
  }

  @ReactMethod
  fun stopPlay(promise: Promise) {
    stopPlayback()
    promise.resolve(true)
  }

  private fun stopPlayback() {
    playSeq.incrementAndGet()
    playing.set(false)
    synchronized(playLock) {
      try { track?.stop() } catch (_: Exception) {}
      try { track?.release() } catch (_: Exception) {}
      track = null
      try { mediaPlayer?.stop() } catch (_: Exception) {}
      try { mediaPlayer?.release() } catch (_: Exception) {}
      mediaPlayer = null
    }
    playThread = null
    emitEnded()
  }

  private fun playDecoded(wav: ByteArray, seq: Int, promise: Promise) {
    if (seq != playSeq.get()) return
    val parsed = parseWavPcm(wav)
    if (parsed == null) {
      playing.set(false)
      promise.reject("BAD_WAV", "not pcm wav")
      emitEnded()
      return
    }
    focusPlayback()
    emitStarted("wav")
    promise.resolve(true)
    playPcm(parsed.first, parsed.second, seq)
  }

  private fun playWithMediaPlayer(wav: ByteArray, seq: Int): Boolean {
    return try {
      val file = File(reactContext.cacheDir, "takecare-voice.wav")
      file.writeBytes(wav)
      val mp = MediaPlayer()
      mp.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      mp.setDataSource(file.absolutePath)
      mp.setVolume(1f, 1f)
      mp.setOnCompletionListener {
        if (seq == playSeq.get()) {
          playing.set(false)
          emitEnded()
        }
        try { mp.release() } catch (_: Exception) {}
        if (mediaPlayer === mp) mediaPlayer = null
      }
      mp.setOnErrorListener { _, what, extra ->
        Log.e(TAG, "MediaPlayer error $what $extra")
        false
      }
      mp.prepare()
      synchronized(playLock) { mediaPlayer = mp }
      mp.start()
      true
    } catch (e: Exception) {
      Log.e(TAG, "MediaPlayer fail: ${e.message}")
      false
    }
  }

  private fun focusPlayback() {
    try {
      val am = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      am.mode = AudioManager.MODE_NORMAL
      am.isSpeakerphoneOn = true
      @Suppress("DEPRECATION")
      am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    } catch (_: Exception) {
    }
  }

  private fun playPcm(pcmBytes: ByteArray, rate: Int, seq: Int) {
    val min = AudioTrack.getMinBufferSize(
      rate,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    if (min <= 0 || pcmBytes.isEmpty()) {
      if (seq == playSeq.get()) {
        playing.set(false)
        emitEnded()
      }
      return
    }
    val staticMode = pcmBytes.size <= 512 * 1024
    val buf = max(min, if (staticMode) pcmBytes.size else 8192)
    val t = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setSampleRate(rate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build()
      )
      .setBufferSizeInBytes(buf)
      .setTransferMode(if (staticMode) AudioTrack.MODE_STATIC else AudioTrack.MODE_STREAM)
      .build()
    synchronized(playLock) { track = t }
    if (staticMode) {
      val written = t.write(pcmBytes, 0, pcmBytes.size)
      Log.i(TAG, "static write=$written size=${pcmBytes.size} rate=$rate")
      t.play()
      var left = pcmBytes.size * 1000L / (rate * 2L) + 120
      while (playing.get() && seq == playSeq.get() && left > 0) {
        val step = minOf(80L, left)
        try { Thread.sleep(step) } catch (_: Exception) { break }
        left -= step
      }
    } else {
      t.play()
      var offset = 0
      while (playing.get() && seq == playSeq.get() && offset < pcmBytes.size) {
        val n = t.write(pcmBytes, offset, minOf(4096, pcmBytes.size - offset))
        if (n <= 0) break
        offset += n
      }
      var left = ((pcmBytes.size - offset).coerceAtLeast(0) * 1000L) / (rate * 2L) + 80
      while (playing.get() && seq == playSeq.get() && left > 0) {
        val step = minOf(80L, left)
        try { Thread.sleep(step) } catch (_: Exception) { break }
        left -= step
      }
    }
    synchronized(playLock) {
      try { t.stop() } catch (_: Exception) {}
      try { t.release() } catch (_: Exception) {}
      if (track === t) track = null
    }
    if (seq == playSeq.get()) {
      playing.set(false)
      emitEnded()
    }
  }

  private fun unmuteMic() {
    try {
      val am = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      am.mode = AudioManager.MODE_NORMAL
      am.isMicrophoneMute = false
    } catch (_: Exception) {
    }
  }

  private fun emitStarted(url: String) {
    val map = Arguments.createMap()
    map.putString("url", url)
    emit("VoiceWavStarted", map)
  }

  private fun emitEnded() {
    emit("VoiceWavEnded", Arguments.createMap())
  }

  private fun emit(name: String, payload: Any) {
    try {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(name, payload)
    } catch (_: Exception) {
    }
  }

  companion object {
    private const val TAG = "VoiceWav"
    private const val SAMPLE_RATE = 16000
    /** 約 0.12 秒：真的什麼都沒講才擋 */
    private const val MIN_SPEECH_BYTES = SAMPLE_RATE * 2 / 8
    /** 補靜音到約 0.6 秒，短句 Whisper 才吃得到 */
    private const val PAD_TO_BYTES = SAMPLE_RATE * 2 * 3 / 5

    private fun padPcm(pcm: ByteArray, minBytes: Int): ByteArray {
      if (pcm.size >= minBytes) return pcm
      val out = ByteArray(minBytes)
      val offset = ((minBytes - pcm.size) / 4) * 2
      System.arraycopy(pcm, 0, out, offset.coerceAtLeast(0), pcm.size)
      return out
    }

    private fun AudioRecord.minBufferSizeHint(): Int {
      val n = AudioRecord.getMinBufferSize(
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      return if (n > 0) n else 4096
    }

    private fun openRecorder(): Pair<AudioRecord, Int>? {
      val sources = intArrayOf(
        MediaRecorder.AudioSource.MIC,
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        MediaRecorder.AudioSource.DEFAULT
      )
      val rates = intArrayOf(44100, 48000, 16000, 22050)
      for (src in sources) {
        for (rate in rates) {
          val min = AudioRecord.getMinBufferSize(
            rate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
          )
          if (min <= 0) continue
          try {
            val rec = AudioRecord(
              src,
              rate,
              AudioFormat.CHANNEL_IN_MONO,
              AudioFormat.ENCODING_PCM_16BIT,
              min * 2
            )
            if (rec.state == AudioRecord.STATE_INITIALIZED) {
              val actual = rec.sampleRate.takeIf { it > 0 } ?: rate
              Log.i(TAG, "open src=$src rate=$actual")
              return rec to actual
            }
            rec.release()
          } catch (_: Exception) {
          }
        }
      }
      return null
    }

    private fun downsamplePcm16(pcm: ByteArray, fromRate: Int, toRate: Int): ByteArray {
      if (fromRate <= 0 || fromRate == toRate || pcm.size < 4) return pcm
      val inSamples = pcm.size / 2
      val outSamples = max(1, ((inSamples.toLong() * toRate) / fromRate).toInt())
      val shorts = ShortArray(inSamples)
      ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts)
      val out = ByteArray(outSamples * 2)
      val dest = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
      for (i in 0 until outSamples) {
        val x = i.toDouble() * fromRate / toRate
        val i0 = x.toInt().coerceIn(0, inSamples - 1)
        val i1 = (i0 + 1).coerceAtMost(inSamples - 1)
        val t = x - i0
        val v = shorts[i0] * (1.0 - t) + shorts[i1] * t
        dest.putShort(v.toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort())
      }
      return out
    }

    private fun peakAbs(pcm: ByteArray): Int {
      val bb = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN)
      var peak = 0
      while (bb.remaining() >= 2) {
        peak = max(peak, abs(bb.short.toInt()))
      }
      return peak
    }

    private fun pcmToWav(pcm: ByteArray, rate: Int): ByteArray {
      val out = ByteArrayOutputStream(44 + pcm.size)
      DataOutputStream(out).use { d ->
        fun le32(v: Int) {
          d.write(v and 0xff)
          d.write(v shr 8 and 0xff)
          d.write(v shr 16 and 0xff)
          d.write(v shr 24 and 0xff)
        }
        fun le16(v: Int) {
          d.write(v and 0xff)
          d.write(v shr 8 and 0xff)
        }
        d.writeBytes("RIFF")
        le32(36 + pcm.size)
        d.writeBytes("WAVE")
        d.writeBytes("fmt ")
        le32(16)
        le16(1)
        le16(1)
        le32(rate)
        le32(rate * 2)
        le16(2)
        le16(16)
        d.writeBytes("data")
        le32(pcm.size)
        d.write(pcm)
      }
      return out.toByteArray()
    }

    private fun fourCc(bytes: ByteArray, offset: Int): String {
      if (offset + 4 > bytes.size) return ""
      return String(bytes, offset, 4, Charsets.US_ASCII)
    }

    private fun parseWavPcm(wav: ByteArray): Pair<ByteArray, Int>? {
      if (wav.size < 44) return null
      if (fourCc(wav, 0) != "RIFF") return null
      var offset = 12
      var rate = SAMPLE_RATE
      var bits = 16
      var channels = 1
      while (offset + 8 <= wav.size) {
        val id = fourCc(wav, offset)
        val size = ByteBuffer.wrap(wav, offset + 4, 4).order(ByteOrder.LITTLE_ENDIAN).int.coerceAtLeast(0)
        val start = offset + 8
        if (id == "fmt ") {
          channels = ByteBuffer.wrap(wav, start + 2, 2).order(ByteOrder.LITTLE_ENDIAN).short.toInt()
          rate = ByteBuffer.wrap(wav, start + 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
          bits = ByteBuffer.wrap(wav, start + 14, 2).order(ByteOrder.LITTLE_ENDIAN).short.toInt()
        } else if (id == "data") {
          if (bits != 16) return null
          val end = minOf(start + size, wav.size)
          var data = wav.copyOfRange(start, end)
          if (channels == 2) data = stereoToMono(data)
          return data to (if (rate > 0) rate else SAMPLE_RATE)
        }
        offset = start + size + (size % 2)
      }
      return null
    }

    private fun stereoToMono(pcm: ByteArray): ByteArray {
      val frames = pcm.size / 4
      val out = ByteArray(frames * 2)
      val src = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN)
      val dst = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
      repeat(frames) {
        val l = src.short.toInt()
        val r = src.short.toInt()
        dst.putShort(((l + r) / 2).toShort())
      }
      return out
    }

    private fun download(src: String): ByteArray {
      val conn = URL(src).openConnection() as HttpURLConnection
      conn.connectTimeout = 12000
      conn.readTimeout = 20000
      conn.instanceFollowRedirects = true
      try {
        conn.inputStream.use { input ->
          val out = ByteArrayOutputStream()
          val buf = ByteArray(8192)
          while (true) {
            val n = input.read(buf)
            if (n <= 0) break
            out.write(buf, 0, n)
          }
          return out.toByteArray()
        }
      } finally {
        conn.disconnect()
      }
    }
  }
}
