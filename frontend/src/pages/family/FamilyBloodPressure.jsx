import BloodPressureDashboard from "../shared/BloodPressureDashboard"

export default function FamilyBloodPressure() {
  return (
    <BloodPressureDashboard
      role="family"
      homePath="/family"
      endpointBase="/family/blood-pressure"
      title="家屬端血壓監看"
      subtitle="查看已綁定長輩的血壓、脈搏與趨勢資料。"
      readOnly
    />
  )
}
