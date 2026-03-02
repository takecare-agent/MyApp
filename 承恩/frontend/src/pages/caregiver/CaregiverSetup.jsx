import { useState } from "react"
import { useNavigate } from "react-router-dom"

export default function CaregiverSetup() {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [experience, setExperience] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    const token = localStorage.getItem("token")
    if (!token) {
      navigate("/")
      return
    }

    if (!name.trim() || !experience.trim()) {
      alert("Please complete all required fields.")
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch("http://localhost:5000/caregiver/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({ name, experience })
      })

      if (!res.ok) {
        alert("Unable to save your profile. Please try again.")
        return
      }

      alert("Caregiver profile saved.")
      navigate("/caregiver")
    } catch (error) {
      console.error(error)
      alert("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="card setup-card">
        <span className="section-kicker">Caregiver Profile</span>
        <h2 className="section-title">Set up your caregiver account</h2>
        <p className="section-subtitle">
          Share your basic profile so families can quickly understand your background.
        </p>

        <div className="form-grid">
          <div>
            <label className="input-label" htmlFor="caregiver-name">
              Display name
            </label>
            <input
              id="caregiver-name"
              className="text-input"
              placeholder="e.g. Alex Chen"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="input-label" htmlFor="caregiver-experience">
              Caregiving experience
            </label>
            <input
              id="caregiver-experience"
              className="text-input"
              placeholder="e.g. 5 years, dementia care"
              value={experience}
              onChange={e => setExperience(e.target.value)}
            />
          </div>
        </div>

        <button className="primary-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving..." : "Save profile"}
        </button>
      </div>
    </div>
  )
}
