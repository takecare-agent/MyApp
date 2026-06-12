import { Platform } from 'react-native';

/**
 * 實體 iPhone 與 Android 手機都要連到「筆電在同一個 Wi-Fi 下的區域網路 IP」。
 *
 * 設定方式：
 * 1. 確認筆電、iPhone、Android 都連同一個 Wi-Fi。
 * 2. 在筆電查詢 IPv4 位址，例如 192.168.0.10 或 192.168.1.23。
 * 3. 將 LAN_BACKEND_HOST 改成該 IPv4 位址。
 *
 * 注意：實體手機不能用 localhost 或 127.0.0.1 連筆電後端。
 */
const LAN_BACKEND_HOST = '192.168.0.10';
const BACKEND_PORT = '5000';

export const API_BASE_URL = `http://${LAN_BACKEND_HOST}:${BACKEND_PORT}`;
export const API_URL = `${API_BASE_URL}/api/bp`;
export const SUMMARY_API_URL = `${API_URL}/summary`;

export const DEVICE_PLATFORM_LABEL = Platform.select({
  ios: 'iOS',
  android: 'Android',
  default: 'Unknown',
});
