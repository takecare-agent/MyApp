export function pad2(n) {
  return String(n).padStart(2, "0")
}

export function nowHhmm(d = new Date()) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function hhmmToDate(hhmm, base = new Date()) {
  const [h, m] = String(hhmm || "00:00").split(":").map((x) => Number(x))
  const d = new Date(base)
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0)
  return d
}

export function formatGivenAt(isoOrHhmm) {
  if (!isoOrHhmm) return nowHhmm()
  const s = String(isoOrHhmm)
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":")
    return `${pad2(h)}:${pad2(m)}`
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return nowHhmm()
  return nowHhmm(d)
}

const MEAL3 = [
  { key: "breakfast", icon: "sunrise" },
  { key: "lunch", icon: "sun" },
  { key: "dinner", icon: "moon" }
]

const MEAL2 = [
  { key: "morning", icon: "sunrise" },
  { key: "evening", icon: "moon" }
]

export function slotMeta(count, index) {
  if (count >= 3) return MEAL3[Math.min(index, 2)]
  if (count === 2) return MEAL2[Math.min(index, 1)]
  return { key: "once", icon: "clock" }
}

export function groupTodayTasks(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  const byTpl = new Map()
  list.forEach((t) => {
    if (t.kind === "template" && t.templateId) {
      const arr = byTpl.get(t.templateId) || []
      arr.push(t)
      byTpl.set(t.templateId, arr)
    }
  })
  const used = new Set()
  const groups = []
  list.forEach((t) => {
    if (used.has(t.id)) return
    if (t.kind === "template" && t.templateId) {
      const slots = (byTpl.get(t.templateId) || [])
        .slice()
        .sort((a, b) => String(a.time).localeCompare(String(b.time)))
      if (slots.length >= 2) {
        slots.forEach((s) => used.add(s.id))
        const labeled = slots.map((s, i) => {
          const meta = slotMeta(slots.length, i)
          return { ...s, slotKey: meta.key, slotIcon: meta.icon }
        })
        const openSlots = labeled.filter((s) => !s.done)
        if (!openSlots.length) return
        groups.push({
          type: "multi",
          id: t.templateId,
          title: t.title || t.content || "",
          contentKey: t.contentKey || "",
          category: t.category || "med",
          createdByRole: t.createdByRole || "",
          createdByName: t.createdByName || "",
          mealTiming: t.mealTiming || "",
          progressDone: labeled.filter((s) => s.done).length,
          progressTotal: labeled.length,
          slots: openSlots
        })
        return
      }
    }
    used.add(t.id)
    if (t.done || t.isCompleted) return
    groups.push({ type: "single", id: t.id, task: t })
  })
  return groups
}

export function firstOpenSlotIndex(slots) {
  const list = Array.isArray(slots) ? slots : []
  return list.findIndex((s) => !s.done)
}

export function inferCategory(kind, title) {
  const text = String(title || "")
  if (/藥|服藥|MAR/i.test(text)) return "med"
  if (/血壓|心跳|心率|脈搏|體溫|溫度|血糖/.test(text)) return "vitals"
  if (/澡|浴|清潔|換尿布|如廁/.test(text)) return "daily_care"
  return "daily_care"
}

export function iconForTask(task) {
  const kind = reportKind(task)
  if (kind === "temp" || kind === "bp" || kind === "hr" || kind === "glucose") return "thermometer"
  const cat = String(task?.category || "")
  const title = String(task?.title || task?.content || "")
  if (cat === "med" || /藥|服藥/.test(title)) return "pill"
  if (cat === "daily_care" || /澡|浴|清潔/.test(title)) return "shower"
  return "check"
}

export function reportKind(task) {
  const title = String(task?.title || task?.content || "")
  if (/體溫|溫度/.test(title)) return "temp"
  if (/血壓/.test(title)) return "bp"
  if (/血糖/.test(title)) return "glucose"
  if (/心跳|心率|脈搏/.test(title)) return "hr"
  return "generic"
}

export function extraSummary(task) {
  const src = task?.reportExtra && typeof task.reportExtra === "object" ? task.reportExtra : {}
  if (src.temp) return `${src.temp}℃`
  if (src.bpSys || src.bpDia) return `${src.bpSys || "—"}/${src.bpDia || "—"} mmHg`
  if (src.hr) return `${src.hr} 次／分`
  if (src.glucose) return `${src.glucose} mg/dL`
  return ""
}

export function creatorLabel(task, t) {
  const name = String(task?.createdByName || "").trim()
  const spaced = name ? ` ${name}` : ""
  if (task?.createdByRole === "caregiver") {
    return t("mar.createdByCaregiver", { name: spaced })
  }
  return t("mar.createdByFamily", { name: spaced })
}
