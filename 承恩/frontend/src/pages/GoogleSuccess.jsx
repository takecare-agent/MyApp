import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function GoogleSuccess() {
  const navigate = useNavigate()

  useEffect(() => {
    // ⭐ 如果已經登入過，就不要再跑
    const existingToken = localStorage.getItem("token")
    if (existingToken) {
      navigate("/patient", { replace: true })
      return
    }

    const params = new URLSearchParams(window.location.search)
    const token = params.get("token")

    console.log("🔑 Google token:", token)

    if (token) {
      localStorage.setItem("token", token)
      localStorage.setItem("role", "patient")
      navigate("/patient", { replace: true })
    } else {
      console.log("❌ 沒拿到 token")
      navigate("/", { replace: true })
    }
  }, [])

  return <p>Google 登入中...</p>
}
