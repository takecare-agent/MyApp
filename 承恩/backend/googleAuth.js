const passport = require("passport")
const GoogleStrategy = require("passport-google-oauth20").Strategy

passport.use(
  new GoogleStrategy(
    {
      clientID: "24420121679-c033d5egdncepsj6mhu4maue6tobgooq.apps.googleusercontent.com",
      clientSecret: "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",
      callbackURL: "http://localhost:5000/auth/google/callback"
    },
    (accessToken, refreshToken, profile, done) => {
      // 從 Google 拿到的使用者資料
      const user = {
        email: profile.emails[0].value,
        name: profile.displayName
      }

      return done(null, user)
    }
  )
)

module.exports = passport