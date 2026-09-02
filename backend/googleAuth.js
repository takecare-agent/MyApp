const passport = require("passport")
const GoogleStrategy = require("passport-google-oauth20").Strategy
require("dotenv").config()

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback"
    },
    (accessToken, refreshToken, profile, done) => {
      const email = profile?.emails?.[0]?.value
      if (!email) return done(new Error("Google 帳號未提供電子郵件"))
      const user = {
        email,
        name: profile.displayName || email.split("@")[0],
        googleSub: profile.id
      }
      return done(null, user)
    }
  )
)

module.exports = passport
