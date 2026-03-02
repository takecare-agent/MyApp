import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

export default function CaregiverHome() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      const token = localStorage.getItem("token")
      if (!token) {
        navigate("/")
        return
      }

      setLoading(true)
      setError("")

      try {
        const checkRes = await fetch("http://localhost:5000/caregiver/check-profile", {
          headers: { Authorization: "Bearer " + token }
        })

        if (!checkRes.ok) {
          throw new Error("Failed to validate caregiver profile status.")
        }

        const checkData = await checkRes.json()
        if (!checkData.profileCompleted) {
          navigate("/caregiver/setup")
          return
        }

        const profileRes = await fetch("http://localhost:5000/caregiver/profile", {
          headers: { Authorization: "Bearer " + token }
        })

        if (!profileRes.ok) {
          throw new Error("Failed to load caregiver profile.")
        }

        const profileData = await profileRes.json()

        if (!cancelled) {
          setProfile(profileData)
        }
      } catch (loadError) {
        console.error(loadError)
        if (!cancelled) {
          setError("Unable to load your caregiver profile right now.")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [navigate])

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("role")
    navigate("/")
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <h2 className="section-title">Caregiver Home</h2>
          <p className="loading-state">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <h2 className="section-title">Caregiver Home</h2>
          <p className="error-state">{error}</p>
          <button className="primary-btn" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home-card">
        <span className="section-kicker">Caregiver Dashboard</span>

        <div className="home-header">
          <h2 className="section-title">
            Welcome, {profile?.name || "Caregiver"}
          </h2>
          <span className="status-chip">Profile Complete</span>
        </div>

        <p className="section-subtitle">
          Keep your profile updated so families can quickly find the support they need.
        </p>

        <div className="profile-grid">
          <div className="profile-item">
            <div className="profile-label">Display Name</div>
            <div className="profile-value">{profile?.name || "-"}</div>
          </div>
          <div className="profile-item">
            <div className="profile-label">Experience</div>
            <div className="profile-value">{profile?.experience || "-"}</div>
          </div>
        </div>

        <div className="action-row">
          <button
            className="secondary-btn"
            onClick={() => navigate("/caregiver/setup")}
          >
            Edit profile
          </button>
          <button className="secondary-btn danger-btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
