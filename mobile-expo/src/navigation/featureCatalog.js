/** 三角色功能定義（IA-1b＋完整入口：不刪功能，規劃中也保留） */

export function getAlertsFeature(role) {
  if (role === "caregiver") {
    return {
      id: "alerts",
      titleKey: "feature.alerts",
      descKey: "feature.alertsDescCg",
      historyPath: "/caregiver/alerts/history"
    }
  }
  if (role === "family") {
    return {
      id: "alerts",
      titleKey: "feature.alerts",
      descKey: "feature.alertsDescFam",
      historyPath: "/family/alerts/history"
    }
  }
  // 受顧者不開「活動」帳本；即時下方列表由 WatchPanel liveFeedFeature 接 /patient/alerts/history
  return null
}

export function getSosFeature(role) {
  if (role === "patient") {
    return {
      id: "sos",
      titleKey: "feature.sosAsk",
      descKey: "feature.sosAskDesc",
      historyPath: "/patient/sos/history",
      createPath: "/patient/sos/trigger",
      createType: "sos"
    }
  }
  return null
}

export function getRemindersFeature(role) {
  if (role === "caregiver") {
    return {
      id: "reminders",
      titleKey: "care.hubReminders",
      descKey: "care.hubRemindersDesc",
      historyPath: "/caregiver/reminders"
    }
  }
  if (role === "family") {
    return {
      id: "reminders",
      titleKey: "reminders.manage",
      descKey: "reminders.todayTodos",
      historyPath: "/family/reminders",
      createPath: "/family/reminders",
      createType: "reminder"
    }
  }
  if (role === "patient") {
    return {
      id: "reminders",
      titleKey: "reminders.todayTitle",
      descKey: "reminders.emptyPatientToday",
      historyPath: "/patient/reminders"
    }
  }
  return null
}

export function getProfileFeature(role) {
  const paths = {
    caregiver: "/caregiver/profile",
    family: "/family/profile",
    patient: "/patient/profile"
  }
  if (!paths[role]) return null
  return {
    id: "profile",
    titleKey: "settings.profile",
    descKey: "profile.basic",
    historyPath: paths[role],
    singleRecord: true
  }
}

/** 設定頁額外入口。規劃中項目已拿掉。 */
export function getSettingsExtras(_role) {
  return []
}

export const ROLE_LABELS = {
  patient: "受顧者",
  family: "家屬",
  caregiver: "看護"
}

export function getMainTabs(_role) {
  return [
    { id: "home", labelKey: "tabs.home", icon: "home" },
    { id: "schedule", labelKey: "tabs.schedule", icon: "grid" },
    { id: "watch", labelKey: "tabs.watch", icon: "monitor" },
    { id: "message", labelKey: "tabs.messages", icon: "message-circle" },
    { id: "settings", labelKey: "tabs.settings", icon: "settings" }
  ]
}
