import { useSearchParams, useNavigate } from "react-router-dom"

export default function RoleSelect() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const email = searchParams.get("email")

  const handleSelectRole = async (role) => {
    if (!email) {
      alert("找不到使用者 email")
      return
    }

    try {
      const res = await fetch("http://localhost:5000/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          role
        })
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.message)
        return
      }

      // ✅ 存 JWT
      localStorage.setItem("token", data.token)

      // ✅ 跳轉對應頁面
      navigate(`/${role}`)

    } catch (err) {
      console.error("設定角色錯誤:", err)
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>請選擇您的身份</h2>

        <button onClick={() => handleSelectRole("patient")}>
          👤 受顧者
        </button>

        <button onClick={() => handleSelectRole("family")}>
          👨‍👩‍👧 家屬端
        </button>

        <button onClick={() => handleSelectRole("caregiver")}>
          👨‍⚕️ 看護端
        </button>
      </div>
    </div>
  )
}
