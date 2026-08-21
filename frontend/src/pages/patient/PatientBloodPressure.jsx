import BloodPressureDashboard from "../shared/BloodPressureDashboard"

export default function PatientBloodPressure() {
  return (
    <BloodPressureDashboard
      role="patient"
      homePath="/patient"
      endpointBase="/patient/blood-pressure"
      title="長輩每日血壓紀錄"
    />
  )
}
