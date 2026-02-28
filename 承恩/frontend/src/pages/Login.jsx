import { useNavigate } from "react-router-dom"
import { useState } from "react"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleLogin = async () => {
  try {
    const res = await fetch("http://localhost:5000/login", {
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
    localStorage.setItem("role", data.role)

    navigate(`/${data.role}`)
  } catch (err) {
    alert("無法連線到後端")
  }
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

        <button
  onClick={() => {
    window.location.href = "http://localhost:5000/auth/google"
  }}
>
  使用 Google 登入
</button>

      </div>
    </div>
  )
}

