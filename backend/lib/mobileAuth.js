const bcrypt = require("bcryptjs")
const crypto = require("crypto")
const jwt = require("jsonwebtoken")
const nodemailer = require("nodemailer")
const {
  verifyGoogleIdToken,
  verifyAppleIdentityToken,
  upsertSocialUser,
  googleAudienceList
} = require("./socialAuth")

const CODE_TTL_MS = 15 * 60 * 1000
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const TEST_PASSWORD = "Test1234!"
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function generateInviteCode() {
  let code = ""
  for (let i = 0; i < 6; i += 1) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]
  }
  return code
}

async function findPatientByInvite(User, inviteCode) {
  const normalized = String(inviteCode || "").trim().toUpperCase()
  if (normalized.length < 4) return null
  const patient = await User.findOne({ role: "patient", inviteCode: normalized })
  if (!patient) return null
  if (patient.inviteCodeExpires && patient.inviteCodeExpires.getTime() < Date.now()) return null
  return patient
}

async function resolveLinkedPatientEmail(User, {
  role,
  linkedPatientEmail,
  inviteCode,
  ownEmail,
  normalizeLinkedPatientEmail,
  validateLinkedPatientEmailForRole
}) {
  let email = normalizeLinkedPatientEmail(linkedPatientEmail)
  const code = String(inviteCode || "").trim().toUpperCase()
  if ((role === "family" || role === "caregiver") && code) {
    const patient = await findPatientByInvite(User, code)
    if (!patient) return { error: "邀請碼無效或已過期" }
    email = patient.email
  }
  return validateLinkedPatientEmailForRole(role, email, ownEmail)
}

function signUserToken(user, expiresIn = "7d") {
  return jwt.sign(
    { email: user.email, role: user.role || null },
    process.env.JWT_SECRET,
    { expiresIn }
  )
}

function publicUser(user) {
  return {
    email: user.email,
    name: user.name || "",
    role: user.role || null,
    linkedPatientEmail: user.linkedPatientEmail || "",
    activePatientEmail: user.activePatientEmail || user.linkedPatientEmail || "",
    emailVerified: Boolean(user.emailVerified),
    sosAudience: user.sosAudience === "caregiver_only" ? "caregiver_only" : "circle",
    lang: user.lang || "zh"
  }
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), 10)
}

async function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false
  return bcrypt.compare(String(password), passwordHash)
}

function generateVerifyCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function hashVerifyCode(code) {
  return bcrypt.hash(String(code), 8)
}

async function matchVerifyCode(code, codeHash) {
  if (!codeHash) return false
  return bcrypt.compare(String(code), codeHash)
}

async function deliverVerifyCode(email, code) {
  const host = process.env.SMTP_HOST
  if (host) {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
        : undefined
    })
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@takecare.local"
    await transporter.sendMail({
      from,
      to: email,
      subject: "TakeCare 電子郵件驗證碼",
      text: `您的 TakeCare 驗證碼是：${code}\n\n15 分鐘內有效。若非本人操作請忽略。`,
      html: `<p>您的 TakeCare 驗證碼是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>15 分鐘內有效。</p>`
    })
    return { via: "smtp" }
  }

  console.log(`[TakeCare email verify] to=${email} code=${code}`)
  return { via: "console" }
}

function exposeCodes() {
  return String(process.env.AUTH_EXPOSE_CODES || "").toLowerCase() === "true"
    || !process.env.SMTP_HOST
}

const {
  upsertMembership,
  removeMembership,
  listCirclesForMember,
  listMembersForPatient,
  ensureMembershipFromLinked,
  pickActivePatientEmail,
  applyActivePatient,
  normalizeEmail
} = require("./careCircle")

/**
 * 掛載手機端帳號 API；並確保三角色測試帳存在（密碼 Test1234!）。
 */
function mountMobileAuth(app, {
  User,
  CareCircleMember,
  normalizeRoleForMobile,
  normalizeLinkedPatientEmail,
  validateLinkedPatientEmailForRole,
  verifyToken
}) {
  async function issueVerifyCode(user) {
    const code = generateVerifyCode()
    user.emailVerifyCodeHash = await hashVerifyCode(code)
    user.emailVerifyExpires = new Date(Date.now() + CODE_TTL_MS)
    await user.save()
    const delivery = await deliverVerifyCode(user.email, code)
    const payload = { via: delivery.via, expiresInSec: Math.floor(CODE_TTL_MS / 1000) }
    if (exposeCodes()) payload.devCode = code
    return payload
  }

  app.post("/mobile/register", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase()
      const name = String(req.body?.name || "").trim()
      const password = String(req.body?.password || "")
      const allowedLang = new Set(["zh", "en", "id", "vi", "tl", "th"])
      const lang = allowedLang.has(String(req.body?.lang || "").trim())
        ? String(req.body.lang).trim()
        : "zh"
      if (!email || !email.includes("@")) {
        return res.status(400).json({ message: "請輸入有效的電子郵件" })
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "密碼至少 8 碼" })
      }
      const existing = await User.findOne({ email })
      if (existing?.passwordHash && existing.emailVerified) {
        return res.status(409).json({ message: "此電子郵件已註冊，請直接登入" })
      }
      if (existing?.passwordHash && !existing.emailVerified) {
        existing.lang = lang
        await existing.save()
        const delivery = await issueVerifyCode(existing)
        return res.status(200).json({
          message: "帳號尚未驗證，已重新寄送驗證碼",
          needsVerification: true,
          email,
          ...delivery
        })
      }

      const passwordHash = await hashPassword(password)
      let user = existing
      if (!user) {
        user = await User.create({
          email,
          name: name || email.split("@")[0],
          passwordHash,
          emailVerified: false,
          role: null,
          profileCompleted: false,
          lang
        })
      } else {
        user.passwordHash = passwordHash
        if (name) user.name = name
        user.lang = lang
        user.emailVerified = false
        await user.save()
      }

      const delivery = await issueVerifyCode(user)
      return res.status(201).json({
        message: "註冊成功，請驗證電子郵件",
        needsVerification: true,
        email: user.email,
        ...delivery
      })
    } catch (err) {
      console.log("mobile register failed:", err.message)
      return res.status(500).json({ message: "註冊失敗" })
    }
  })

  app.post("/mobile/resend-verify", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase()
      const user = await User.findOne({ email })
      if (!user) return res.status(404).json({ message: "找不到此帳號" })
      if (user.emailVerified) return res.status(400).json({ message: "此帳號已驗證" })
      const delivery = await issueVerifyCode(user)
      return res.json({ message: "驗證碼已寄出", email, ...delivery })
    } catch (err) {
      return res.status(500).json({ message: "寄送失敗" })
    }
  })

  app.post("/mobile/verify-email", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase()
      const code = String(req.body?.code || "").trim()
      if (!email || code.length < 4) {
        return res.status(400).json({ message: "請輸入電子郵件與驗證碼" })
      }
      const user = await User.findOne({ email })
      if (!user) return res.status(404).json({ message: "找不到此帳號" })
      if (user.emailVerified) {
        const token = signUserToken(user)
        return res.json({
          message: "已驗證",
          token,
          needsRole: !user.role,
          user: publicUser(user)
        })
      }
      if (!user.emailVerifyExpires || user.emailVerifyExpires.getTime() < Date.now()) {
        return res.status(400).json({ message: "驗證碼已過期，請重新寄送" })
      }
      const ok = await matchVerifyCode(code, user.emailVerifyCodeHash)
      if (!ok) return res.status(400).json({ message: "驗證碼不正確" })

      user.emailVerified = true
      user.emailVerifyCodeHash = undefined
      user.emailVerifyExpires = undefined
      await user.save()

      const token = signUserToken(user)
      return res.json({
        message: "驗證成功",
        token,
        needsRole: !user.role,
        user: publicUser(user)
      })
    } catch (err) {
      return res.status(500).json({ message: "驗證失敗" })
    }
  })

  app.post("/mobile/login", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase()
      const password = String(req.body?.password || "")
      if (!email || !password) {
        return res.status(400).json({ message: "請輸入電子郵件與密碼" })
      }
      const user = await User.findOne({ email })
      if (!user) return res.status(401).json({ message: "帳號或密碼錯誤" })
      if (!user.passwordHash) {
        return res.status(401).json({
          message: "此帳號尚未設定密碼。請使用「測試快速登入」，或重新註冊設定密碼。"
        })
      }
      const ok = await verifyPassword(password, user.passwordHash)
      if (!ok) return res.status(401).json({ message: "帳號或密碼錯誤" })
      if (!user.emailVerified) {
        const delivery = await issueVerifyCode(user)
        return res.status(403).json({
          message: "請先完成電子郵件驗證",
          needsVerification: true,
          email,
          ...delivery
        })
      }
      const token = signUserToken(user)
      return res.json({
        token,
        needsRole: !user.role,
        user: publicUser(user),
        role: user.role || null
      })
    } catch (err) {
      return res.status(500).json({ message: "登入失敗" })
    }
  })

  app.get("/mobile/me", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })
      return res.json({
        token: signUserToken(user),
        needsRole: !user.role,
        role: user.role || null,
        user: publicUser(user)
      })
    } catch (err) {
      return res.status(401).json({ message: "登入已失效" })
    }
  })

  app.get("/mobile/auth/config", (_req, res) => {
    const googleReady = googleAudienceList().length > 0 && Boolean(process.env.GOOGLE_CLIENT_SECRET)
    const appleReady = Boolean(process.env.APPLE_CLIENT_ID || process.env.APPLE_BUNDLE_ID)
    res.json({
      google: {
        enabled: googleReady || Boolean(process.env.GOOGLE_CLIENT_ID),
        webClientId: process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
        iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || "",
        browserOAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
      },
      apple: {
        enabled: appleReady,
        clientId: process.env.APPLE_CLIENT_ID || process.env.APPLE_BUNDLE_ID || ""
      }
    })
  })

  async function respondSocialLogin(res, user) {
    const token = signUserToken(user)
    return res.json({
      token,
      needsRole: !user.role,
      role: user.role || null,
      user: publicUser(user)
    })
  }

  app.post("/mobile/auth/google", async (req, res) => {
    try {
      const profile = await verifyGoogleIdToken(req.body?.idToken)
      const user = await upsertSocialUser(User, profile)
      return respondSocialLogin(res, user)
    } catch (err) {
      console.log("mobile google auth failed:", err.message)
      return res.status(err.status || 401).json({ message: err.message || "Google 登入失敗" })
    }
  })

  app.post("/mobile/auth/apple", async (req, res) => {
    try {
      const profile = await verifyAppleIdentityToken(req.body?.identityToken)
      const fullName = [req.body?.fullName?.givenName, req.body?.fullName?.familyName]
        .filter(Boolean)
        .join(" ")
      const user = await upsertSocialUser(User, profile, { fullName })
      return respondSocialLogin(res, user)
    } catch (err) {
      console.log("mobile apple auth failed:", err.message)
      return res.status(err.status || 401).json({ message: err.message || "Apple 登入失敗" })
    }
  })

  app.post("/mobile/complete-profile", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })
      if (!user.emailVerified) {
        return res.status(403).json({ message: "請先驗證電子郵件" })
      }

      const role = normalizeRoleForMobile(req.body?.role)
      if (!role || !["patient", "family", "caregiver"].includes(String(req.body?.role || ""))) {
        return res.status(400).json({ message: "請選擇身分" })
      }
      const linkedResult = await resolveLinkedPatientEmail(User, {
        role,
        linkedPatientEmail: req.body?.linkedPatientEmail,
        inviteCode: req.body?.inviteCode,
        ownEmail: user.email,
        normalizeLinkedPatientEmail,
        validateLinkedPatientEmailForRole
      })
      if (linkedResult?.error) return res.status(400).json({ message: linkedResult.error })

      user.role = role
      user.linkedPatientEmail = linkedResult || ""
      user.activePatientEmail = linkedResult || ""
      if (typeof req.body?.name === "string" && req.body.name.trim()) {
        user.name = req.body.name.trim()
      }
      user.profileCompleted = true
      await user.save()
      if (linkedResult && (role === "family" || role === "caregiver") && CareCircleMember) {
        await upsertMembership(CareCircleMember, {
          patientEmail: linkedResult,
          memberEmail: user.email,
          roleInCircle: role
        })
      }

      const token = signUserToken(user)
      return res.json({
        token,
        role: user.role,
        user: publicUser(user)
      })
    } catch (err) {
      return res.status(500).json({ message: "設定身分失敗" })
    }
  })

  async function buildCareCirclePayload(user) {
    const role = user.role || null
    if (CareCircleMember) {
      const dirty = await ensureMembershipFromLinked(CareCircleMember, user)
      if (dirty) await user.save()
    }

    let circles = []
    let activePatientEmail = ""
    let members = []
    let patient = null

    if (role === "patient") {
      activePatientEmail = normalizeEmail(user.email)
      circles = [
        {
          patientEmail: activePatientEmail,
          patientName: user.name || "",
          roleInCircle: "patient",
          isActive: true
        }
      ]
      members = CareCircleMember
        ? await listMembersForPatient(CareCircleMember, User, user.email)
        : []
      patient = { email: user.email, name: user.name || "" }
    } else if (role === "family" || role === "caregiver") {
      circles = CareCircleMember
        ? await listCirclesForMember(CareCircleMember, User, user.email)
        : []
      // 相容：若成員表空但有 linked，補一筆顯示
      if (!circles.length && normalizeLinkedPatientEmail(user.linkedPatientEmail)) {
        const p = await User.findOne({
          email: normalizeLinkedPatientEmail(user.linkedPatientEmail),
          role: "patient"
        }).lean()
        if (p) {
          circles = [
            {
              patientEmail: p.email,
              patientName: p.name || "",
              roleInCircle: role,
              joinedAt: null
            }
          ]
        }
      }
      activePatientEmail = pickActivePatientEmail(user, circles)
      if (activePatientEmail && normalizeEmail(user.activePatientEmail) !== activePatientEmail) {
        await applyActivePatient(user, activePatientEmail)
      }
      circles = circles.map(c => ({
        ...c,
        isActive: c.patientEmail === activePatientEmail
      }))
      if (activePatientEmail) {
        patient = await User.findOne({ email: activePatientEmail, role: "patient" })
          .select("email name")
          .lean()
        members = CareCircleMember
          ? await listMembersForPatient(CareCircleMember, User, activePatientEmail)
          : []
      }
    }

    const inviteActive =
      role === "patient" &&
      user.inviteCode &&
      (!user.inviteCodeExpires || user.inviteCodeExpires.getTime() > Date.now())

    return {
      role,
      linkedPatientEmail: activePatientEmail || user.linkedPatientEmail || "",
      activePatientEmail: activePatientEmail || "",
      circles,
      patient: patient ? { email: patient.email, name: patient.name || "" } : null,
      members,
      inviteCode: inviteActive ? user.inviteCode : null,
      inviteCodeExpires: inviteActive ? user.inviteCodeExpires || null : null
    }
  }

  app.get("/mobile/care-circle", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })
      const circle = await buildCareCirclePayload(user)
      return res.json({
        ...circle,
        user: publicUser(user),
        needsRole: !user.role
      })
    } catch (err) {
      return res.status(500).json({ message: "讀取照護圈失敗" })
    }
  })

  app.post("/mobile/care-circle/invite/rotate", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })
      if (user.role !== "patient") {
        return res.status(403).json({ message: "僅受顧者可產生邀請碼" })
      }

      let code = generateInviteCode()
      for (let i = 0; i < 5; i += 1) {
        const clash = await User.findOne({ inviteCode: code, email: { $ne: user.email } })
        if (!clash) break
        code = generateInviteCode()
      }
      user.inviteCode = code
      user.inviteCodeExpires = new Date(Date.now() + INVITE_TTL_MS)
      await user.save()

      return res.json({
        inviteCode: user.inviteCode,
        inviteCodeExpires: user.inviteCodeExpires,
        expiresInSec: Math.floor(INVITE_TTL_MS / 1000)
      })
    } catch (err) {
      return res.status(500).json({ message: "產生邀請碼失敗" })
    }
  })

  app.post("/mobile/care-circle/bind", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })
      if (!user.emailVerified) {
        return res.status(403).json({ message: "請先驗證電子郵件" })
      }
      if (user.role !== "family" && user.role !== "caregiver") {
        return res.status(403).json({ message: "僅家屬或看護可綁定照護圈" })
      }

      const linkedResult = await resolveLinkedPatientEmail(User, {
        role: user.role,
        linkedPatientEmail: req.body?.linkedPatientEmail,
        inviteCode: req.body?.inviteCode,
        ownEmail: user.email,
        normalizeLinkedPatientEmail,
        validateLinkedPatientEmailForRole
      })
      if (linkedResult?.error) return res.status(400).json({ message: linkedResult.error })

      if (CareCircleMember) {
        await upsertMembership(CareCircleMember, {
          patientEmail: linkedResult,
          memberEmail: user.email,
          roleInCircle: user.role
        })
      }
      await applyActivePatient(user, linkedResult)
      user.profileCompleted = true
      await user.save()

      const token = signUserToken(user)
      const circle = await buildCareCirclePayload(user)
      return res.json({
        message: "已加入照護圈",
        token,
        role: user.role,
        user: publicUser(user),
        ...circle
      })
    } catch (err) {
      return res.status(500).json({ message: "綁定失敗" })
    }
  })

  /** 切換目前操作的長輩圈 */
  app.post("/mobile/care-circle/switch", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })
      if (user.role !== "family" && user.role !== "caregiver") {
        return res.status(403).json({ message: "僅家屬或看護可切換照護圈" })
      }
      const patientEmail = normalizeEmail(req.body?.patientEmail)
      if (!patientEmail) return res.status(400).json({ message: "缺少長輩 Email" })
      const membership = CareCircleMember
        ? await CareCircleMember.findOne({
            patientEmail,
            memberEmail: normalizeEmail(user.email)
          })
        : null
      const legacyOk =
        !membership &&
        normalizeLinkedPatientEmail(user.linkedPatientEmail) === patientEmail
      if (!membership && !legacyOk) {
        return res.status(403).json({ message: "你不在該照護圈" })
      }
      if (!membership && CareCircleMember) {
        await upsertMembership(CareCircleMember, {
          patientEmail,
          memberEmail: user.email,
          roleInCircle: user.role
        })
      }
      await applyActivePatient(user, patientEmail)
      const circle = await buildCareCirclePayload(user)
      return res.json({
        message: "已切換照護圈",
        token: signUserToken(user),
        role: user.role,
        user: publicUser(user),
        ...circle
      })
    } catch (err) {
      return res.status(500).json({ message: "切換失敗" })
    }
  })

  /** 看護／家屬退出某一圈（預設目前圈；可指定 patientEmail） */
  app.post("/mobile/care-circle/leave", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })
      if (user.role !== "family" && user.role !== "caregiver") {
        return res.status(403).json({ message: "僅家屬或看護可退出照護圈" })
      }
      const target =
        normalizeEmail(req.body?.patientEmail) ||
        normalizeEmail(user.activePatientEmail) ||
        normalizeLinkedPatientEmail(user.linkedPatientEmail)
      if (!target) return res.status(400).json({ message: "尚未加入照護圈" })

      if (CareCircleMember) {
        await removeMembership(CareCircleMember, target, user.email)
      }
      const remaining = CareCircleMember
        ? await listCirclesForMember(CareCircleMember, User, user.email)
        : []
      if (remaining.length) {
        await applyActivePatient(user, remaining[0].patientEmail)
      } else {
        user.activePatientEmail = ""
        user.linkedPatientEmail = ""
        await user.save()
      }
      const token = signUserToken(user)
      const circle = await buildCareCirclePayload(user)
      return res.json({
        message: "已退出照護圈",
        token,
        role: user.role,
        user: publicUser(user),
        ...circle
      })
    } catch (err) {
      return res.status(500).json({ message: "退出失敗" })
    }
  })

  /** 受顧者移除單一成員 */
  app.post("/mobile/care-circle/remove-member", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })
      if (user.role !== "patient") {
        return res.status(403).json({ message: "僅受顧者可移除成員" })
      }
      const memberEmail = String(req.body?.memberEmail || "").trim().toLowerCase()
      if (!memberEmail) return res.status(400).json({ message: "缺少成員 Email" })
      if (memberEmail === user.email) {
        return res.status(400).json({ message: "不能移除自己" })
      }

      const patientEmail = normalizeEmail(user.email)
      let removed = false
      if (CareCircleMember) {
        const row = await CareCircleMember.findOne({ patientEmail, memberEmail })
        if (row) {
          await removeMembership(CareCircleMember, patientEmail, memberEmail)
          removed = true
        }
      }
      const member = await User.findOne({
        email: memberEmail,
        role: { $in: ["family", "caregiver"] }
      })
      if (!removed && member && normalizeLinkedPatientEmail(member.linkedPatientEmail) === patientEmail) {
        removed = true
      }
      if (!removed) return res.status(404).json({ message: "找不到該成員或未在此圈" })

      if (member) {
        const other = CareCircleMember
          ? await CareCircleMember.findOne({ memberEmail }).sort({ joinedAt: 1 })
          : null
        if (other) {
          member.activePatientEmail = other.patientEmail
          member.linkedPatientEmail = other.patientEmail
        } else {
          member.activePatientEmail = ""
          member.linkedPatientEmail = ""
        }
        await member.save()
      }

      const circle = await buildCareCirclePayload(user)
      return res.json({ message: "已移除成員", ...circle })
    } catch (err) {
      return res.status(500).json({ message: "移除失敗" })
    }
  })

  /** 受顧者解散照護圈：清掉所有綁定者＋作廢邀請碼 */
  app.post("/mobile/care-circle/dissolve", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })
      if (user.role !== "patient") {
        return res.status(403).json({ message: "僅受顧者可解散照護圈" })
      }
      const patientEmail = normalizeEmail(user.email)
      const memberEmails = CareCircleMember
        ? (await CareCircleMember.find({ patientEmail }).select("memberEmail").lean()).map(r =>
            normalizeEmail(r.memberEmail)
          )
        : []
      if (CareCircleMember) {
        await CareCircleMember.deleteMany({ patientEmail })
      }
      const helpers = await User.find({
        role: { $in: ["family", "caregiver"] },
        $or: [
          { linkedPatientEmail: patientEmail },
          ...(memberEmails.length ? [{ email: { $in: memberEmails } }] : [])
        ]
      })
      for (const helper of helpers) {
        if (CareCircleMember) {
          const remaining = await listCirclesForMember(CareCircleMember, User, helper.email)
          if (remaining.length) {
            await applyActivePatient(helper, remaining[0].patientEmail)
          } else {
            helper.activePatientEmail = ""
            helper.linkedPatientEmail = ""
            await helper.save()
          }
        } else if (normalizeLinkedPatientEmail(helper.linkedPatientEmail) === patientEmail) {
          helper.linkedPatientEmail = ""
          helper.activePatientEmail = ""
          await helper.save()
        }
      }
      user.inviteCode = undefined
      user.inviteCodeExpires = undefined
      await user.save()
      const circle = await buildCareCirclePayload(user)
      return res.json({ message: "已解散照護圈", ...circle })
    } catch (err) {
      return res.status(500).json({ message: "解散失敗" })
    }
  })

  app.post("/mobile/care-circle/reset-identity", async (req, res) => {
    try {
      const decoded = verifyToken(req)
      if (!decoded?.email) return res.status(401).json({ message: "請先登入" })
      const user = await User.findOne({ email: decoded.email })
      if (!user) return res.status(404).json({ message: "找不到使用者" })

      if (CareCircleMember) {
        await CareCircleMember.deleteMany({ memberEmail: normalizeEmail(user.email) })
      }
      user.role = null
      user.linkedPatientEmail = ""
      user.activePatientEmail = ""
      user.profileCompleted = false
      user.inviteCode = undefined
      user.inviteCodeExpires = undefined
      await user.save()

      const token = signUserToken(user)
      return res.json({
        message: "已重置身分，請重新選擇",
        token,
        needsRole: true,
        role: null,
        user: publicUser(user)
      })
    } catch (err) {
      return res.status(500).json({ message: "重置身分失敗" })
    }
  })

  async function ensureTestAccounts() {
    // 三角測試帳：保登入＋保證預設圈 patient↔caregiver/family（重啟勿洗既有綁定）
    const PATIENT = "patient@test.com"
    const accounts = [
      { email: PATIENT, name: "受顧者測試", role: "patient", lang: "zh" },
      { email: "caregiver@test.com", name: "看護測試", role: "caregiver", lang: "vi" },
      { email: "family@test.com", name: "家屬測試", role: "family", lang: "en" }
    ]
    const passwordHash = await hashPassword(TEST_PASSWORD)
    for (const item of accounts) {
      let user = await User.findOne({ email: item.email })
      if (!user) {
        const linked =
          item.role === "patient" ? "" : PATIENT
        await User.create({
          email: item.email,
          name: item.name,
          role: item.role,
          lang: item.lang,
          linkedPatientEmail: linked,
          activePatientEmail: linked,
          passwordHash,
          emailVerified: true,
          profileCompleted: true
        })
        continue
      }
      // 只補密碼／驗證；绝不清空既有 linked／active／角色
      user.passwordHash = passwordHash
      user.emailVerified = true
      if (!user.name) user.name = item.name
      // 三角色驗收語言鎖定（家屬 en／長輩 zh／看護 vi），避免 inbox 譯文跟模擬器介面脫節
      if (item.lang) user.lang = item.lang
      if (!user.role) {
        user.role = item.role
        user.profileCompleted = true
      }
      if (
        (user.role === "family" || user.role === "caregiver") &&
        !normalizeEmail(user.linkedPatientEmail) &&
        !normalizeEmail(user.activePatientEmail)
      ) {
        user.linkedPatientEmail = PATIENT
        user.activePatientEmail = PATIENT
      }
      await user.save()
    }
    if (CareCircleMember) {
      for (const helper of [
        { email: "caregiver@test.com", roleInCircle: "caregiver" },
        { email: "family@test.com", roleInCircle: "family" }
      ]) {
        await upsertMembership(CareCircleMember, {
          patientEmail: PATIENT,
          memberEmail: helper.email,
          roleInCircle: helper.roleInCircle
        })
      }
    }
    console.log(
      `[TakeCare] test accounts ready (password=${TEST_PASSWORD}; default circle ensured)`
    )
  }

  return { ensureTestAccounts, TEST_PASSWORD }
}

module.exports = {
  mountMobileAuth,
  hashPassword,
  TEST_PASSWORD: "Test1234!"
}
