const { OAuth2Client } = require("google-auth-library")
const { createRemoteJWKSet, jwtVerify } = require("jose")

const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"))

function googleAudienceList() {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID
  ].filter(Boolean)
}

async function verifyGoogleIdToken(idToken) {
  const audiences = googleAudienceList()
  if (!audiences.length) {
    const err = new Error("尚未設定 GOOGLE_CLIENT_ID／GOOGLE_WEB_CLIENT_ID")
    err.status = 503
    throw err
  }
  const client = new OAuth2Client(audiences[0])
  const ticket = await client.verifyIdToken({
    idToken: String(idToken || ""),
    audience: audiences
  })
  const payload = ticket.getPayload()
  if (!payload?.email) {
    const err = new Error("Google 帳號未提供電子郵件")
    err.status = 400
    throw err
  }
  if (payload.email_verified === false) {
    const err = new Error("Google 電子郵件尚未驗證")
    err.status = 400
    throw err
  }
  return {
    provider: "google",
    sub: payload.sub,
    email: String(payload.email).trim().toLowerCase(),
    name: payload.name || payload.email.split("@")[0]
  }
}

async function verifyAppleIdentityToken(identityToken) {
  const audience = process.env.APPLE_CLIENT_ID || process.env.APPLE_BUNDLE_ID
  if (!audience) {
    const err = new Error("尚未設定 APPLE_CLIENT_ID（Bundle ID 或 Services ID）")
    err.status = 503
    throw err
  }
  const { payload } = await jwtVerify(String(identityToken || ""), appleJwks, {
    issuer: "https://appleid.apple.com",
    audience
  })
  const email = payload.email ? String(payload.email).trim().toLowerCase() : ""
  return {
    provider: "apple",
    sub: String(payload.sub || ""),
    email,
    name: ""
  }
}

async function upsertSocialUser(User, profile, { fullName } = {}) {
  const provider = profile.provider
  const subField = provider === "google" ? "googleSub" : "appleSub"
  let user = null

  if (profile.sub) {
    user = await User.findOne({ [subField]: profile.sub })
  }
  if (!user && profile.email) {
    user = await User.findOne({ email: profile.email })
  }

  const displayName =
    (fullName && String(fullName).trim()) ||
    profile.name ||
    (profile.email ? profile.email.split("@")[0] : "TakeCare 用戶")

  if (!user) {
    if (!profile.email) {
      const err = new Error("此 Apple 帳號未提供 Email，請改用信箱註冊或使用曾授權過 Email 的 Apple 登入")
      err.status = 400
      throw err
    }
    user = await User.create({
      email: profile.email,
      name: displayName,
      emailVerified: true,
      role: null,
      profileCompleted: false,
      [subField]: profile.sub,
      authProviders: [provider]
    })
  } else {
    if (!user[subField]) user[subField] = profile.sub
    user.emailVerified = true
    if (!user.name && displayName) user.name = displayName
    const providers = Array.isArray(user.authProviders) ? user.authProviders : []
    if (!providers.includes(provider)) {
      user.authProviders = [...providers, provider]
    }
    if (profile.email && user.email !== profile.email && !user.email) {
      user.email = profile.email
    }
    await user.save()
  }

  return user
}

module.exports = {
  verifyGoogleIdToken,
  verifyAppleIdentityToken,
  upsertSocialUser,
  googleAudienceList
}
