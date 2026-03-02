require("dotenv").config()

const express = require("express")
const cors = require("cors")
const passport = require("passport")
const jwt = require("jsonwebtoken")
const mongoose = require("mongoose")

require("./googleAuth")

const app = express()

console.log("🔥 ACTIVE BACKEND FILE LOADED")

// ================= MongoDB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB error:", err.message))

// ================= Middleware =================
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}))

app.use(express.json())
app.use(passport.initialize())

// ================= User Schema =================
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    required: true
  },

  name: String,

  role: {
    type: String,
    enum: ["patient", "family", "caregiver"],
    default: null
  },

  // ===== 受顧者資料 =====
  birthDate: String,
  age: Number,
  idNumber: String,
  gender: String,

  // ===== 家屬資料 =====
  phone: String,

  // ===== 看護資料 =====
  experience: String,

  profileCompleted: {
    type: Boolean,
    default: false
  }

}, { timestamps: true })

const User = mongoose.model("User", userSchema)

// ================= 測試 API =================
app.get("/", (req, res) => {
  res.send("Backend is running!")
})

// ================= Google 登入 =================
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
)

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.redirect("http://localhost:5173")
      }

      const { email, name } = req.user

      let user = await User.findOne({ email })

      if (!user) {
        user = await User.create({
          email,
          name,
          role: null,
          profileCompleted: false
        })
      }

      const token = jwt.sign(
        { email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      )

      return res.redirect(
        `http://localhost:5173/google-success?token=${token}`
      )

    } catch (err) {
      console.log("❌ callback error:", err.message)
      return res.redirect("http://localhost:5173")
    }
  }
)

// ================= 設定角色 =================
app.post("/set-role", async (req, res) => {
  try {
    const { email, role } = req.body

    const user = await User.findOne({ email })
    if (!user) return res.status(404).json({ message: "使用者不存在" })

    user.role = role
    user.profileCompleted = false
    await user.save()

    const newToken = jwt.sign(
      { email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    )

    res.json({ token: newToken, role: user.role })

  } catch (err) {
    console.log("❌ set-role error:", err.message)
    res.status(500).json({ message: "設定角色失敗" })
  }
})

// ================= 共用驗證 =================
function verifyToken(req, res) {
  const token = req.headers.authorization?.split(" ")[1]
  if (!token) return null
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return null
  }
}

// ================= PATIENT =================
app.get("/patient/check-profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  res.json({ profileCompleted: user.profileCompleted })
})

app.get("/patient/profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })

  res.json({
    name: user.name,
    birthDate: user.birthDate,
    age: user.age,
    idNumber: user.idNumber,
    gender: user.gender
  })
})

app.post("/patient/setup", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const { name, birthDate, age, idNumber, gender } = req.body

  const user = await User.findOne({ email: decoded.email })

  user.name = name
  user.birthDate = birthDate
  user.age = age
  user.idNumber = idNumber
  user.gender = gender
  user.profileCompleted = true

  await user.save()

  res.json({ message: "基本資料已儲存" })
})

// ================= FAMILY =================
app.get("/family/check-profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  res.json({ profileCompleted: user.profileCompleted })
})

app.get("/family/profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })

  res.json({
    name: user.name,
    phone: user.phone
  })
})

app.post("/family/setup", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const { name, phone } = req.body

  const user = await User.findOne({ email: decoded.email })

  user.name = name
  user.phone = phone
  user.profileCompleted = true

  await user.save()

  res.json({ message: "家屬資料已儲存" })
})

// ================= CAREGIVER =================
app.get("/caregiver/check-profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })
  res.json({ profileCompleted: user.profileCompleted })
})

app.get("/caregiver/profile", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const user = await User.findOne({ email: decoded.email })

  res.json({
    name: user.name,
    experience: user.experience
  })
})

app.post("/caregiver/setup", async (req, res) => {
  const decoded = verifyToken(req, res)
  if (!decoded) return res.status(401).json({ message: "未提供或無效 token" })

  const { name, experience } = req.body

  const user = await User.findOne({ email: decoded.email })

  user.name = name
  user.experience = experience
  user.profileCompleted = true

  await user.save()

  res.json({ message: "看護資料已儲存" })
})

// ================= 啟動 =================
app.listen(5000, () => {
  console.log("🚀 Backend running on http://localhost:5000")
})