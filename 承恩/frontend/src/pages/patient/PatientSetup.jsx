import { useState } from "react"
import { useNavigate } from "react-router-dom"

export default function PatientSetup() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: "",
    birthDate: "",
    age: "",
    idNumber: "",
    gender: "male",
    phone: ""
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    const token = localStorage.getItem("token")
    if (!token) {
      navigate("/")
      return
    }

    if (!form.name.trim() || !form.birthDate || !form.age || !form.idNumber.trim()) {
      alert("請填寫完整基本資料。")
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch("http://localhost:5000/patient/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          ...form,
          age: Number(form.age),
          phone: form.phone.trim()
        })
      })

      if (!res.ok) {
        alert("儲存失敗，請稍後再試。")
        return
      }

      alert("受顧者基本資料已儲存。")
      navigate("/patient")
    } catch (error) {
      console.error(error)
      alert("網路異常，請稍後再試。")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="card setup-card">
        <span className="section-kicker">受顧者資料</span>
        <h2 className="section-title">建立受顧者基本檔案</h2>
        <p className="section-subtitle">
          此頁先為介面版本，後續可由組員擴充欄位驗證與資料同步流程。
        </p>

        <div className="form-grid">
          <div>
            <label className="input-label" htmlFor="patient-name">
              姓名
            </label>
            <input
              id="patient-name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="例如：王伯伯"
            />
          </div>

          <div>
            <label className="input-label" htmlFor="patient-birthdate">
              生日
            </label>
            <input
              id="patient-birthdate"
              type="date"
              value={form.birthDate}
              onChange={e => setForm({ ...form, birthDate: e.target.value })}
            />
          </div>

          <div>
            <label className="input-label" htmlFor="patient-age">
              年齡
            </label>
            <input
              id="patient-age"
              type="number"
              min="1"
              value={form.age}
              onChange={e => setForm({ ...form, age: e.target.value })}
              placeholder="例如：78"
            />
          </div>

          <div>
            <label className="input-label" htmlFor="patient-id">
              身分證字號
            </label>
            <input
              id="patient-id"
              value={form.idNumber}
              onChange={e => setForm({ ...form, idNumber: e.target.value })}
              placeholder="例如：A123456789"
            />
          </div>

          <div>
            <label className="input-label" htmlFor="patient-phone">
              聯絡電話
            </label>
            <input
              id="patient-phone"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="例如：0912345678"
            />
          </div>

          <div>
            <label className="input-label" htmlFor="patient-gender">
              性別
            </label>
            <select
              id="patient-gender"
              value={form.gender}
              onChange={e => setForm({ ...form, gender: e.target.value })}
            >
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
          </div>
        </div>

        <button className="primary-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "儲存中..." : "儲存資料"}
        </button>
      </div>
    </div>
  )
}
