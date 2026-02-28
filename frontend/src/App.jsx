import { Routes, Route, Navigate } from "react-router-dom"

// 公開頁面
import Login from "./pages/Login"
import Register from "./pages/Register"
import RoleSelect from "./pages/RoleSelect"

// Setup 頁面
import PatientSetup from "./pages/patient/PatientSetup"
import FamilySetup from "./pages/family/FamilySetup"
import CaregiverSetup from "./pages/caregiver/CaregiverSetup"

// 首頁
import PatientHome from "./pages/patient/PatientHome"
import FamilyHome from "./pages/family/FamilyHome"
import CaregiverHome from "./pages/caregiver/CaregiverHome"

// 🔐 登入守門
function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token")
  return token ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>

      {/* ================= 公開頁面 ================= */}
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* 第一次選角色（不能加保護） */}
      <Route path="/role" element={<RoleSelect />} />

      {/* ================= Setup 頁面 ================= */}
      {/* 不能加 ProtectedRoute，因為 token 是 URL 帶進來 */}
      <Route path="/patient/setup" element={<PatientSetup />} />
      <Route path="/family/setup" element={<FamilySetup />} />
      <Route path="/caregiver/setup" element={<CaregiverSetup />} />

      {/* ================= 各角色首頁 ================= */}
      <Route
        path="/patient"
        element={
          <ProtectedRoute>
            <PatientHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/family"
        element={
          <ProtectedRoute>
            <FamilyHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/caregiver"
        element={
          <ProtectedRoute>
            <CaregiverHome />
          </ProtectedRoute>
        }
      />

      {/* 其他路徑全部導回登入 */}
      <Route path="*" element={<Navigate to="/" replace />} />

    </Routes>
  )
}