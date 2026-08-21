import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { API_BASE_URL, GOOGLE_AUTH_URL } from "../config/runtime"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // ===== 一般登入 =====
  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })

      if (!res.ok) {
        alert("登入失敗")
        return
      }

      const data = await res.json()

      // ⭐ 存 JWT
      localStorage.setItem("token", data.token)
      if (data.role) {
        localStorage.setItem("role", data.role)
      } else {
        localStorage.removeItem("role")
      }

      navigate(data.role ? `/${data.role}` : "/role")
    } catch {
      alert("無法連線到後端")
    }
  }

  // ===== Google 登入 =====
  const handleGoogleLogin = () => {
    window.location.href = GOOGLE_AUTH_URL
  }

  return (
    <div className="page">
      <div className="card">
        <h2>登入</h2>

        <input
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <button onClick={handleLogin}>
          一般登入
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
