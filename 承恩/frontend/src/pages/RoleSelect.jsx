import { useEffect, useState } from "react"

export default function RoleSelect() {
  const [email, setEmail] = useState("")

  useEffect(() => {
    const token = localStorage.getItem("token")

    if (!token) {
      alert("未登入")
      window.location.href = "/"
      return
    }

    const payload = JSON.parse(atob(token.split(".")[1]))

    if (!payload.email) {
      alert("找不到使用者 email")
      window.location.href = "/"
      return
    }

    setEmail(payload.email)
  }, [])

  const handleSelectRole = async (role) => {
    try {
      const res = await fetch("http://localhost:5000/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, role })
      })

      const data = await res.json()

      localStorage.setItem("token", data.token)
      localStorage.setItem("role", role)

      window.location.href = `/${role}`

    } catch (err) {
      alert("設定角色失敗")
    }
  }

  return (
    <div>
      <h2>請選擇您的身份</h2>

      <button onClick={() => handleSelectRole("patient")}>
        受顧者
      </button>

      <button onClick={() => handleSelectRole("family")}>
        家屬端
      </button>

      <button onClick={() => handleSelectRole("caregiver")}>
        看護端
      </button>
    </div>
  )
}
