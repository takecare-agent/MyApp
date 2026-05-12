import axios from 'axios';

// ⚠️ 請將下面的 192.168.x.x 改成你電腦的 IP 位址
// 例如: 'http://192.168.1.104:3000'
const API_URL = 'http://172.20.10.10:3000'; 

const client = axios.create({
  baseURL: API_URL,
});

export default client;