import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function GoogleSuccess() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("token")

    console.log("🔥 GoogleSuccess token:", token)

    // ⭐ 如果有 token 才處理
    if (token) {
      localStorage.setItem("token", token)
      navigate("/role", { replace: true })
    }

    // ❌ 不要在 token 為 null 時導回首頁
    // 因為 StrictMode 會跑兩次

  }, [navigate])

  return <h2>Google 登入中...</h2>
}