/**
 * R91 多照護圈：成員關係＋目前圈輔助
 * 過渡期與 User.linkedPatientEmail 雙寫（linked＝目前操作長輩）
 */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase()
}

function createCareCircleMemberModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      patientEmail: { type: String, required: true, index: true },
      memberEmail: { type: String, required: true, index: true },
      roleInCircle: { type: String, enum: ["family", "caregiver"], required: true },
      joinedAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
  )
  schema.index({ patientEmail: 1, memberEmail: 1 }, { unique: true })
  return mongoose.models.CareCircleMember || mongoose.model("CareCircleMember", schema)
}

async function upsertMembership(CareCircleMember, { patientEmail, memberEmail, roleInCircle }) {
  const patient = normalizeEmail(patientEmail)
  const member = normalizeEmail(memberEmail)
  if (!patient || !member) return null
  return CareCircleMember.findOneAndUpdate(
    { patientEmail: patient, memberEmail: member },
    {
      $set: { roleInCircle, patientEmail: patient, memberEmail: member },
      $setOnInsert: { joinedAt: new Date() }
    },
    { upsert: true, new: true }
  )
}

async function removeMembership(CareCircleMember, patientEmail, memberEmail) {
  return CareCircleMember.deleteOne({
    patientEmail: normalizeEmail(patientEmail),
    memberEmail: normalizeEmail(memberEmail)
  })
}

async function listCirclesForMember(CareCircleMember, User, memberEmail) {
  const email = normalizeEmail(memberEmail)
  const rows = await CareCircleMember.find({ memberEmail: email }).sort({ joinedAt: 1 }).lean()
  const patientEmails = rows.map(r => r.patientEmail)
  const patients = patientEmails.length
    ? await User.find({ email: { $in: patientEmails }, role: "patient" }).select("email name").lean()
    : []
  const byEmail = Object.fromEntries(patients.map(p => [normalizeEmail(p.email), p]))
  return rows.map(r => {
    const p = byEmail[r.patientEmail] || {}
    return {
      patientEmail: r.patientEmail,
      patientName: p.name || "",
      roleInCircle: r.roleInCircle,
      joinedAt: r.joinedAt
    }
  })
}

async function listMembersForPatient(CareCircleMember, User, patientEmail) {
  const email = normalizeEmail(patientEmail)
  const patient = await User.findOne({ email, role: "patient" }).select("email name role lang avatarData").lean()
  const members = []
  if (patient) {
    members.push({
      email: patient.email,
      name: patient.name || "",
      role: "patient",
      lang: patient.lang || "zh",
      avatarData: patient.avatarData || ""
    })
  }
  const rows = await CareCircleMember.find({ patientEmail: email }).lean()
  if (rows.length) {
    const emails = rows.map(r => r.memberEmail)
    const users = await User.find({ email: { $in: emails } }).select("email name role lang avatarData").lean()
    const byEmail = Object.fromEntries(users.map(u => [normalizeEmail(u.email), u]))
    for (const row of rows) {
      const u = byEmail[row.memberEmail]
      members.push({
        email: row.memberEmail,
        name: u?.name || "",
        role: row.roleInCircle || u?.role || "family",
        lang: u?.lang || "zh",
        avatarData: u?.avatarData || ""
      })
    }
  } else {
    // 遷移／相容：舊單欄綁定
    const legacy = await User.find({
      role: { $in: ["family", "caregiver"] },
      linkedPatientEmail: email
    })
      .select("email name role lang avatarData")
      .lean()
    for (const item of legacy) {
      members.push({
        email: item.email,
        name: item.name || "",
        role: item.role,
        lang: item.lang || "zh",
        avatarData: item.avatarData || ""
      })
    }
  }
  return members
}

async function ensureMembershipFromLinked(CareCircleMember, user) {
  if (!user || (user.role !== "family" && user.role !== "caregiver")) return false
  let dirty = false
  const linked = normalizeEmail(user.linkedPatientEmail)
  if (!linked) return false
  const existing = await CareCircleMember.findOne({
    patientEmail: linked,
    memberEmail: normalizeEmail(user.email)
  })
  if (!existing) {
    await upsertMembership(CareCircleMember, {
      patientEmail: linked,
      memberEmail: user.email,
      roleInCircle: user.role
    })
  }
  if (!normalizeEmail(user.activePatientEmail)) {
    user.activePatientEmail = linked
    dirty = true
  }
  return dirty
}

function pickActivePatientEmail(user, circles) {
  const active = normalizeEmail(user.activePatientEmail)
  if (active && circles.some(c => c.patientEmail === active)) return active
  const linked = normalizeEmail(user.linkedPatientEmail)
  if (linked && circles.some(c => c.patientEmail === linked)) return linked
  return circles[0]?.patientEmail || ""
}

async function applyActivePatient(user, patientEmail) {
  const email = normalizeEmail(patientEmail)
  user.activePatientEmail = email
  // 雙寫：舊路徑仍讀 linkedPatientEmail 當「目前長輩」
  user.linkedPatientEmail = email
  await user.save()
}

module.exports = {
  INVITE_TTL_MS,
  normalizeEmail,
  createCareCircleMemberModel,
  upsertMembership,
  removeMembership,
  listCirclesForMember,
  listMembersForPatient,
  ensureMembershipFromLinked,
  pickActivePatientEmail,
  applyActivePatient
}
