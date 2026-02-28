const express = require("express")
const cors = require("cors")
const session = require("express-session")
const jwt = require("jsonwebtoken")
const passport = require("passport")
const mongoose = require("mongoose")

require("./googleAuth")

const app = express()

// ================= MongoDB 連線 =================
mongoose.connect("mongodb+srv://justin931027_db_user:k0tMeXaaPpbQukDP@cluster0.nzed5jr.mongodb.net/?appName=Cluster0")
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB error:", err.message))

// ================= 中間件 =================
app.use(cors())
app.use(express.json())

app.use(
  session({
    secret: "google-login-secret",
    resave: false,
    saveUninitialized: false
  })
)

app.use(passport.initialize())
app.use(passport.session())

const SECRET_KEY = "care-app-secret-key"

// ================= User Schema =================
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  name: String,
  role: String,
  profileCompleted: { type: Boolean, default: false }
})

const User = mongoose.model("User", userSchema)

// ================= 測試 =================
app.get("/", (req, res) => {
  res.send("Backend is running!")
})

// ================= Google OAuth 開始 =================
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
)

// ================= Google Callback（方法一：每次都選角色） =================
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {

    console.log("🔥 Google callback hit")
    console.log("req.user =", req.user)

    try {
      if (!req.user) {
        console.log("❌ req.user 不存在")
        return res.redirect("http://localhost:5173/")
      }

      const { email, name } = req.user

      // 查詢使用者
      let user = await User.findOne({ email })

      // 第一次登入 → 建立使用者
      if (!user) {
        console.log("🆕 建立新使用者")

        user = await User.create({
          email,
          name,
          role: null,
          profileCompleted: false
        })
      }

      // ⭐ 方法一：每次登入都進角色選擇頁
      console.log("➡ 每次登入都導向角色選擇頁")

      return res.redirect(
        `http://localhost:5173/role?email=${email}`
      )

    } catch (err) {
      console.log("❌ callback error:", err.message)
      return res.redirect("http://localhost:5173/")
    }
  }
)

// ================= 設定角色 =================
app.post("/set-role", async (req, res) => {
  const { email, role } = req.body

  const user = await User.findOne({ email })

  if (!user) {
    return res.status(400).json({ message: "使用者不存在" })
  }

  user.role = role
  await user.save()

  const token = jwt.sign(
    { email, role },
    SECRET_KEY,
    { expiresIn: "1h" }
  )

  res.json({ token, role })
})

// ================= 完成基本資料 =================
app.post("/complete-profile", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (!token) return res.status(401).json({ message: "未提供 token" })

  jwt.verify(token, SECRET_KEY, async (err, decoded) => {
    if (err) return res.status(403).json({ message: "token 無效" })

    const user = await User.findOne({ email: decoded.email })
    if (!user) return res.status(404).json({ message: "找不到使用者" })

    user.profileCompleted = true
    await user.save()

    res.json({ message: "基本資料完成" })
  })
})

// ================= JWT 測試 =================
app.get("/profile", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (!token) return res.status(401).json({ message: "未提供 token" })

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ message: "token 無效" })

    res.json({ message: "JWT 驗證成功", user: decoded })
  })
})

// ================= 啟動伺服器 =================
app.listen(5000, () => {
  console.log("🚀 Backend running on http://localhost:5000")
})