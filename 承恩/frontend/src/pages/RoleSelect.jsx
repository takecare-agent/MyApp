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

  useEffect(() => {
    if (!email) {
      alert("Login expired, please sign in again.")
      window.location.href = "/"
    }
  }, [email])

  const handleSelectRole = async (role) => {
    try {
      const res = await fetch(`${API_BASE_URL}/set-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, role }),
      })

      const data = await res.json()

      localStorage.setItem("token", data.token)
      localStorage.setItem("role", role)

      window.location.href = `/${role}`
    } catch {
      alert("Failed to set role, please try again.")
    }
  }

  return (
    <div>
      <h2>Select your role</h2>

      <button onClick={() => handleSelectRole("patient")}>Patient</button>

      <button onClick={() => handleSelectRole("family")}>Family</button>

      <button onClick={() => handleSelectRole("caregiver")}>Caregiver</button>
    </div>
  )
}
