import { createContext, useContext } from "react"

const NightSkinContext = createContext(false)

export function NightSkinProvider({ value, children }) {
  return (
    <NightSkinContext.Provider value={Boolean(value)}>
      {children}
    </NightSkinContext.Provider>
  )
}

export function useNightSkin() {
  return useContext(NightSkinContext)
}
