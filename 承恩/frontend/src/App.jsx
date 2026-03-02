import { Navigate, Route, Routes } from "react-router-dom"

import GoogleSuccess from "./pages/GoogleSuccess"
import Login from "./pages/Login"
import Register from "./pages/Register"
import RoleSelect from "./pages/RoleSelect"

import CaregiverHome from "./pages/caregiver/CaregiverHome"
import CaregiverSetup from "./pages/caregiver/CaregiverSetup"

import FamilyAlerts from "./pages/family/FamilyAlerts"
import FamilyCareRecords from "./pages/family/FamilyCareRecords"
import FamilyEventHistory from "./pages/family/FamilyEventHistory"
import FamilyHome from "./pages/family/FamilyHome"
import FamilyPhraseLibrary from "./pages/family/FamilyPhraseLibrary"
import FamilySetup from "./pages/family/FamilySetup"
import FamilySosCenter from "./pages/family/FamilySosCenter"

import PatientBloodPressure from "./pages/patient/PatientBloodPressure"
import PatientHome from "./pages/patient/PatientHome"
import PatientSetup from "./pages/patient/PatientSetup"
import PatientSos from "./pages/patient/PatientSos"
import PatientWearable from "./pages/patient/PatientWearable"

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token")
  return token ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/google-success" element={<GoogleSuccess />} />
      <Route path="/role" element={<RoleSelect />} />

      <Route path="/patient/setup" element={<PatientSetup />} />
      <Route path="/family/setup" element={<FamilySetup />} />
      <Route path="/caregiver/setup" element={<CaregiverSetup />} />

      <Route
        path="/patient"
        element={
          <ProtectedRoute>
            <PatientHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patient/sos"
        element={
          <ProtectedRoute>
            <PatientSos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patient/wearable"
        element={
          <ProtectedRoute>
            <PatientWearable />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patient/blood-pressure"
        element={
          <ProtectedRoute>
            <PatientBloodPressure />
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
        path="/family/alerts"
        element={
          <ProtectedRoute>
            <FamilyAlerts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/family/sos"
        element={
          <ProtectedRoute>
            <FamilySosCenter />
          </ProtectedRoute>
        }
      />
      <Route
        path="/family/care-records"
        element={
          <ProtectedRoute>
            <FamilyCareRecords />
          </ProtectedRoute>
        }
      />
      <Route
        path="/family/events"
        element={
          <ProtectedRoute>
            <FamilyEventHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/family/phrases"
        element={
          <ProtectedRoute>
            <FamilyPhraseLibrary />
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
    </Routes>
  )
}
