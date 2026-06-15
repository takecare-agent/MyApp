import SosReceiverDashboard from "../shared/SosReceiverDashboard"

export default function FamilySosCenter() {
  return (
    <SosReceiverDashboard
      role="family"
      homePath="/family"
      endpointBase="/family/sos"
      title="家屬 SOS 通知中心"
      subtitle="即時輪詢受顧者端 SOS，支援彈窗提醒、地圖導航、電話回撥與事件結案。"
    />
  )
}
