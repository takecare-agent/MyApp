import { useEffect, useRef } from "react"
import { AppState } from "react-native"

/** 前景時定時重抓；進背景暫停；回前景立刻抓一次。 */
export function usePollingRefresh(load, { intervalMs = 5000, enabled = true } = {}) {
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    if (!enabled) return undefined

    let id = null
    const tick = () => {
      loadRef.current?.({ silent: true })
    }
    const start = () => {
      if (id != null) return
      id = setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (id == null) return
      clearInterval(id)
      id = null
    }

    if (AppState.currentState === "active") start()

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        tick()
        start()
      } else {
        stop()
      }
    })

    return () => {
      stop()
      sub.remove()
    }
  }, [enabled, intervalMs])
}
