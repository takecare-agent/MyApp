const passport = require("passport")
const GoogleStrategy = require("passport-google-oauth20").Strategy
require("dotenv").config()

require("dotenv").config()

// Only initialize Google OAuth if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== "replace-me") {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback"
      },
      (accessToken, refreshToken, profile, done) => {
        const user = {
          email: profile.emails[0].value,
          name: profile.displayName
        }
        return done(null, user)
      }
    )
  )
  console.log("[Auth] Google OAuth initialized")
} else {
  console.log("[Auth] Google OAuth skipped (no credentials)")
}

module.exports = passport
