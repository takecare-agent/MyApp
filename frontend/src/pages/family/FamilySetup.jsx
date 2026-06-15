import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_BASE_URL } from "../../config/runtime"

export default function FamilySetup() {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    const token = localStorage.getItem("token")
    if (!token) {
      navigate("/")
      return
    }

    if (!name.trim() || !phone.trim()) {
      alert("Please complete all required fields.")
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch(`${API_BASE_URL}/family/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({ name, phone })
      })

      if (!res.ok) {
        alert("Unable to save your profile. Please try again.")
        return
      }

      alert("Family profile saved.")
      navigate("/family")
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
        <span className="section-kicker">Family Profile</span>
        <h2 className="section-title">Set up your family account</h2>
        <p className="section-subtitle">
          填寫聯絡資料，方便照護人員快速聯繫家屬。
        </p>

        <div className="form-grid">
          <div>
            <label className="input-label" htmlFor="family-name">
              Family contact name
            </label>
            <input
              id="family-name"
              className="text-input"
              placeholder="e.g. Jamie Lin"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="input-label" htmlFor="family-phone">
              Contact phone
            </label>
            <input
              id="family-phone"
              className="text-input"
              placeholder="e.g. 0912-345-678"
              value={phone}
              onChange={e => setPhone(e.target.value)}
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
