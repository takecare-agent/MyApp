import SosReceiverDashboard from "../shared/SosReceiverDashboard"

export default function CaregiverSosCenter() {
  return (
    <SosReceiverDashboard
      role="caregiver"
      homePath="/caregiver"
      endpointBase="/caregiver/sos"
      title="照護端 SOS 指揮中心"
      subtitle="照護人員可接收受顧者 SOS，直接開啟地圖、回撥電話並標記處理狀態。"
    />
  )
}
