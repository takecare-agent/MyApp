import BloodPressureDashboard from "../shared/BloodPressureDashboard"

export default function CaregiverBloodPressure() {
  return (
    <BloodPressureDashboard
      role="caregiver"
      homePath="/caregiver"
      endpointBase="/caregiver/blood-pressure"
      title="受顧者血壓照護紀錄"
    />
  )
}
