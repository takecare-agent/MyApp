import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

export default function CaregiverHome() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      navigate("/")
      return
    }

    fetch("http://localhost:5000/caregiver/check-profile", {
      headers: { Authorization: "Bearer " + token }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.completed) {
          navigate("/caregiver/setup")
          return
        }

        return fetch("http://localhost:5000/caregiver/profile", {
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
        <h2>看護首頁</h2>

        <p><strong>姓名：</strong>{profile.name}</p>
        <p><strong>電話：</strong>{profile.phone}</p>
        <p><strong>工作年資：</strong>{profile.experienceYears} 年</p>

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