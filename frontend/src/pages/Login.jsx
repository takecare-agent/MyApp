import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { API_BASE_URL, GOOGLE_AUTH_URL } from "../config/runtime"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  // 開發／Demo 登入：走 /mobile/dev-login（後端無 /login）
  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      alert("請輸入 Email")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/mobile/dev-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          name: name.trim() || normalizedEmail.split("@")[0],
          role: "patient"
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.message || "登入失敗")
        return
      }

      localStorage.setItem("token", data.token)
      if (data.role) {
        localStorage.setItem("role", data.role)
      } else {
        localStorage.removeItem("role")
      }

      // 先拿到 token；若要換家屬／看護身分，再到 /role 綁定長輩
      navigate(data.role ? `/${data.role}` : "/role")
    } catch {
      alert("無法連線到後端")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    window.location.href = GOOGLE_AUTH_URL
  }

  return (
    <div className="page">
      <div className="card">
        <h2>登入</h2>
        <p style={{ color: "#526b88", fontSize: 14, marginBottom: 12 }}>
          Demo 無密碼：輸入 Email 即可（與 App 相同 /mobile/dev-login）。
          預設為受顧者；要當家屬／看護請登入後到「選擇身分」綁定長輩 Email。
        </p>

        <input
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoCapitalize="none"
        />

        <input
          placeholder="顯示名稱（可留空）"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <button onClick={handleLogin} disabled={loading}>
          {loading ? "登入中..." : "一般登入"}
        </button>

        <button
          onClick={() => navigate("/role")}
          style={{ marginTop: 8 }}
        >
          選擇／切換身分
        </button>

        <hr style={{ margin: "20px 0" }} />

        <button
          onClick={handleGoogleLogin}
          style={{
            backgroundColor: "#4285F4",
            color: "white",
            padding: "10px",
            borderRadius: "5px",
            border: "none",
            cursor: "pointer"
          }}
        >
          使用 Google 登入
        </button>
      </div>
    </div>
  )
}
