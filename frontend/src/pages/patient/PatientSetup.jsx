import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

export default function PatientSetup() {
  const location = useLocation()
  const navigate = useNavigate()

  const [name, setName] = useState("")
  const [birthYear, setBirthYear] = useState("")
  const [birthMonth, setBirthMonth] = useState("")
  const [birthDay, setBirthDay] = useState("")
  const [age, setAge] = useState("")
  const [idNumber, setIdNumber] = useState("")
  const [gender, setGender] = useState("")

  // ⭐ 自動存 token
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const token = params.get("token")
    if (token) {
      localStorage.setItem("token", token)
    }
  }, [location])

  const handleSubmit = async () => {
    const token = localStorage.getItem("token")

    const res = await fetch("http://localhost:5000/complete-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      }
    })

    if (res.ok) {
      alert("基本資料完成")
      navigate("/patient")
    } else {
      alert("儲存失敗")
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>受顧者基本資料</h2>

        <input
          placeholder="姓名"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <div>
          出生年月日：
          <select onChange={e => setBirthYear(e.target.value)}>
            <option>年</option>
            {Array.from({ length: 100 }, (_, i) => 2024 - i).map(y => (
              <option key={y}>{y}</option>
            ))}
          </select>

          <select onChange={e => setBirthMonth(e.target.value)}>
            <option>月</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m}>{m}</option>
            ))}
          </select>

          <select onChange={e => setBirthDay(e.target.value)}>
            <option>日</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>

        <select onChange={e => setAge(e.target.value)}>
          <option>年齡</option>
          {Array.from({ length: 120 }, (_, i) => i + 1).map(a => (
            <option key={a}>{a}</option>
          ))}
        </select>

        <input
          placeholder="身分證字號"
          value={idNumber}
          onChange={e => setIdNumber(e.target.value)}
        />

        <select onChange={e => setGender(e.target.value)}>
          <option>性別</option>
          <option>男</option>
          <option>女</option>
        </select>

        <button onClick={handleSubmit}>送出</button>
      </div>
    </div>
  )
}