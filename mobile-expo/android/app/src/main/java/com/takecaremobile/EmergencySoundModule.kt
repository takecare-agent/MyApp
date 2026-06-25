package com.takecaremobile

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class EmergencySoundModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private var player: MediaPlayer? = null

  override fun getName(): String = "EmergencySound"

  @ReactMethod
  fun start() {
    try {
      if (player?.isPlaying == true) return
      stop()

      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

      player = MediaPlayer().apply {
        setDataSource(reactContext, uri)
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Exception) {
      stop()
    }
  }

  @ReactMethod
  fun stop() {
    try {
      player?.stop()
    } catch (_: Exception) {
    } finally {
      try {
        player?.release()
      } catch (_: Exception) {
      }
      player = null
    }
  }
}
