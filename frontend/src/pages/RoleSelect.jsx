import { useEffect, useState } from "react"
import { API_BASE_URL } from "../config/runtime"

function readEmailFromToken() {
  const token = localStorage.getItem("token")
  if (!token) return ""

  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.email || ""
  } catch {
    return ""
  }
}

export default function RoleSelect() {
  const [email] = useState(readEmailFromToken)
  const [linkedPatientEmail, setLinkedPatientEmail] = useState("")
  const [submittingRole, setSubmittingRole] = useState("")

  useEffect(() => {
    if (!email) {
      alert("Login expired, please sign in again.")
      window.location.href = "/"
    }
  }, [email])

  const handleSelectRole = async (role) => {
    if ((role === "family" || role === "caregiver") && !linkedPatientEmail.trim()) {
      alert("請先輸入要綁定的長輩帳號 Email。")
      return
    }

    setSubmittingRole(role)
    try {
      const res = await fetch(`${API_BASE_URL}/set-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, role, linkedPatientEmail }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.message || "Failed to set role, please try again.")
        return
      }

      localStorage.setItem("token", data.token)
      localStorage.setItem("role", role)

      window.location.href = `/${role}`
    } catch {
      alert("Failed to set role, please try again.")
    } finally {
      setSubmittingRole("")
    }
  }

  return (
    <div className="page">
      <div className="card setup-card">
      <h2 className="section-title">選擇身份並完成綁定</h2>
      <p className="section-subtitle">
        長輩端不需要綁定；家屬與照顧者請在這裡直接綁定長輩帳號 Email。
      </p>

      <div className="form-grid">
        <div>
          <label className="input-label" htmlFor="role-linked-patient-email">
            長輩帳號 Email
          </label>
          <input
            id="role-linked-patient-email"
            className="text-input"
            placeholder="選家屬或照顧者時填寫，例如 patient@test.com"
            value={linkedPatientEmail}
            onChange={e => setLinkedPatientEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="action-row">
        <button
          className="primary-btn"
          onClick={() => handleSelectRole("patient")}
          disabled={Boolean(submittingRole)}
        >
          {submittingRole === "patient" ? "處理中..." : "我是長輩"}
        </button>

        <button
          className="secondary-btn"
          onClick={() => handleSelectRole("family")}
          disabled={Boolean(submittingRole)}
        >
          {submittingRole === "family" ? "處理中..." : "我是家屬"}
        </button>

        <button
          className="secondary-btn"
          onClick={() => handleSelectRole("caregiver")}
          disabled={Boolean(submittingRole)}
        >
          {submittingRole === "caregiver" ? "處理中..." : "我是照顧者"}
        </button>
      </div>
      </div>
    </div>
  )
}
