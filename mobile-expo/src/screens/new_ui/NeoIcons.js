import { Image } from "react-native"

export const ICON_MINT = "#10B981"
export const ICON_MUTED = "#8E95A3"
export const ICON_WHITE = "#FFFFFF"
export const ICON_CORAL = "#E05A47"
export const ICON_INK = "#0D0F11"

const ICONS = {
  home: require("./icons/home.png"),
  grid: require("./icons/grid.png"),
  monitor: require("./icons/monitor.png"),
  info: require("./icons/info.png"),
  settings: require("./icons/settings.png"),
  phone: require("./icons/phone.png"),
  "book-open": require("./icons/book-open.png"),
  "user-plus": require("./icons/user-plus.png"),
  user: require("./icons/user.png"),
  calendar: require("./icons/calendar.png"),
  activity: require("./icons/activity.png"),
  "refresh-cw": require("./icons/refresh-cw.png"),
  search: require("./icons/search.png"),
  tag: require("./icons/tag.png"),
  "file-text": require("./icons/file-text.png"),
  "edit-3": require("./icons/edit-3.png"),
  edit: require("./icons/edit-3.png"),
  eye: require("./icons/eye.png"),
  moon: require("./icons/moon.png"),
  heart: require("./icons/heart.png"),
  list: require("./icons/list.png"),
  check: require("./icons/check.png"),
  "chevron-right": require("./icons/chevron-right.png"),
  "arrow-right": require("./icons/arrow-right.png"),
  "chevron-down": require("./icons/chevron-down.png"),
  "chevron-up": require("./icons/chevron-up.png"),
  thermometer: require("./icons/thermometer.png"),
  circle: require("./icons/circle.png"),
  play: require("./icons/play.png"),
  mic: require("./icons/mic.png"),
  plus: require("./icons/plus.png"),
  "trash-2": require("./icons/trash-2.png"),
  clock: require("./icons/clock.png"),
  users: require("./icons/users.png"),
  globe: require("./icons/globe.png"),
  "volume-2": require("./icons/volume-2.png"),
  "log-out": require("./icons/log-out.png"),
  smile: require("./icons/smile.png"),
  link: require("./icons/link.png"),
  filter: require("./icons/filter.png"),
  "chevron-left": require("./icons/chevron-left.png"),
  "alert-circle": require("./icons/alert-circle.png"),
  "maximize-2": require("./icons/maximize-2.png"),
  "message-circle": require("./icons/message-circle.png"),
  "rotate-cw": require("./icons/rotate-cw.png"),
  radio: require("./icons/radio.png"),
  "edit-2": require("./icons/edit-2.png"),
  broadcast: require("./icons/broadcast.png"),
  "run-fast": require("./icons/run-fast.png"),
  "human-male": require("./icons/human-male.png"),
  "lightbulb-on": require("./icons/lightbulb-on.png"),
  "emoticon-neutral": require("./icons/emoticon-neutral.png"),
  "emoticon-happy": require("./icons/emoticon-happy.png"),
  "emoticon-confused": require("./icons/emoticon-confused.png"),
  "emoticon-dizzy": require("./icons/emoticon-dizzy.png"),
  call: require("./icons/call.png"),
  "heart-fill": require("./icons/heart-fill.png"),
  "heart-circle": require("./icons/heart-circle.png"),
  "play-fill": require("./icons/play-fill.png"),
  "ion-radio": require("./icons/ion-radio.png")
}

export function NeoIcon({
  name,
  size = 20,
  color = ICON_MINT,
  glow = false,
  style
}) {
  const src = ICONS[name]
  if (!src) return null
  return (
    <Image
      source={src}
      resizeMode="contain"
      style={[
        { width: size, height: size, tintColor: color },
        glow
          ? {
              shadowColor: color,
              shadowOpacity: 0.8,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 }
            }
          : null,
        style
      ]}
    />
  )
}

export function IconHome(props) {
  return <NeoIcon name="home" {...props} />
}

export function IconGrid(props) {
  return <NeoIcon name="grid" {...props} />
}

export function IconMonitor(props) {
  return <NeoIcon name="monitor" {...props} />
}

export function IconInfo(props) {
  return <NeoIcon name="info" {...props} />
}

export function IconSettings(props) {
  return <NeoIcon name="settings" {...props} />
}

export function IconPhone(props) {
  return <NeoIcon name="phone" color={ICON_CORAL} {...props} />
}

export function IconBook(props) {
  return <NeoIcon name="book-open" glow {...props} />
}

export function IconUserPlus(props) {
  return <NeoIcon name="user-plus" glow {...props} />
}

export function IconUser(props) {
  return <NeoIcon name="user" color={ICON_WHITE} {...props} />
}

export function IconCalendar(props) {
  return <NeoIcon name="calendar" glow {...props} />
}

export function IconActivity(props) {
  return <NeoIcon name="activity" glow {...props} />
}

export function IconRefresh(props) {
  return <NeoIcon name="refresh-cw" glow {...props} />
}

export function IconSearch(props) {
  return <NeoIcon name="search" color={ICON_MUTED} {...props} />
}

export function IconTag(props) {
  return <NeoIcon name="tag" glow {...props} />
}

export function IconFile(props) {
  return <NeoIcon name="file-text" glow {...props} />
}

export function IconEdit(props) {
  return <NeoIcon name="edit-3" glow {...props} />
}

export function IconEye(props) {
  return <NeoIcon name="eye" glow {...props} />
}

export function IconMoon(props) {
  return <NeoIcon name="moon" glow {...props} />
}

export function IconHeart(props) {
  return <NeoIcon name="heart" glow {...props} />
}

export function IconList(props) {
  return <NeoIcon name="list" {...props} />
}

export function IconCheck(props) {
  return <NeoIcon name="check" color={ICON_INK} size={14} {...props} />
}

export function IconChevronRight(props) {
  return <NeoIcon name="chevron-right" color={ICON_MUTED} {...props} />
}

export function IconArrowRight(props) {
  return <NeoIcon name="arrow-right" color={ICON_WHITE} {...props} />
}

export function IconThermometer(props) {
  return <NeoIcon name="thermometer" glow {...props} />
}

export const TAB_ICONS = {
  home: "home",
  schedule: "grid",
  watch: "monitor",
  message: "info",
  settings: "settings"
}
