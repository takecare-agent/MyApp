import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

export default function PatientHome() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      navigate("/")
      return
    }

    // 檢查是否填過資料
    fetch("http://localhost:5000/patient/check-profile", {
      headers: { Authorization: "Bearer " + token }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.completed) {
          navigate("/patient/setup")
          return
        }

        // 已填 → 取得資料
        return fetch("http://localhost:5000/patient/profile", {
          headers: { Authorization: "Bearer " + token }
        })
      })
      .then(res => res?.json())
      .then(profileData => {
        if (profileData) {
          setProfile(profileData)
          setLoading(false)
        }
      })
      .catch(() => navigate("/"))
  }, [navigate])

  if (loading) {
    return (
      <div className="page">
        <div className="card"><h2>載入中...</h2></div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="card">
        <h2>受顧者首頁</h2>

        <p><strong>姓名：</strong>{profile.name}</p>
        <p><strong>出生年月日：</strong>{profile.birthDate}</p>
        <p><strong>年齡：</strong>{profile.age}</p>
        <p><strong>身分證字號：</strong>{profile.idNumber}</p>
        <p><strong>性別：</strong>{profile.gender === "male" ? "男" : "女"}</p>

        <button onClick={() => {
          localStorage.removeItem("token")
          navigate("/")
        }}>
          登出
        </button>
      </div>
    </div>
  )
}