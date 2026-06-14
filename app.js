require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { translate } = require('google-translate-api-x');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = 'mongodb://localhost:27017/demo';
const fs = require('fs');
const axios = require('axios');

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const GOOGLE_API_KEY = 'AIzaSyCNuHziWnihp-KqAKENHcqym8uCiJvDwhM';

// 語音辨識 API
app.post('/speech-to-text', async (req, res) => {
  const { audioBase64, langCode } = req.body;
  console.log('收到語音辨識請求, langCode:', langCode);
  console.log('audioBase64 長度:', audioBase64?.length);

  // 語言碼對應
  const langMap = {
    zh: 'zh-TW', en: 'en-US', id: 'id-ID',
    vi: 'vi-VN', tl: 'fil-PH', th: 'th-TH'
  };
  const languageCode = langMap[langCode] || 'zh-TW';

  try {
    console.log('送出 Google STT 請求...');
    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`,
      {
        config: {
          encoding: 'MP3',
          sampleRateHertz: 16000,
          languageCode,
          model: 'default',
          enableAutomaticPunctuation: true,
        },
        audio: {
          content: audioBase64,
        },
      }
    );
    console.log('Google STT 回應:', JSON.stringify(response.data));

    const results = response.data.results;
    if (results && results.length > 0) {
      const transcript = results[0].alternatives[0].transcript;
      res.json({ success: true, text: transcript });
    } else {
      res.json({ success: false, text: '' });
    }
  } catch (e) {
    console.log('STT 錯誤:', e.response?.data || e.message);
    res.json({ success: false, text: '' });
  }
});

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB連線成功(DB: demo)'))
    .catch(err => console.error('MongoDB連線失敗:', err));

const DANGER_KEYWORDS = [
    "救護車", "流血", "痛", "跌倒", "昏倒", "緊急", "受傷", "呼吸困難", "心跳", "不舒服", "想吐", "頭暈", "危險", "求救",
    "ambulance", "bleeding", "pain", "fall", "faint", "emergency", "hurt", "breath", "dizzy", "danger", "help",
    "ambulans", "berdarah", "sakit", "jatuh", "pingsan", "darurat", "luka", "napas", "pusing", "bahaya", "tolong",
    "รถพยาบาล", "เลือดออก", "เจ็บ", "ปวด", "ล้ม", "เป็นลม", "ฉุกเฉิน", "บาดเจ็บ", "หายใจ", "เวียนหัว", "อันตราย", "ช่วยด้วย",
    "cấp cứu", "chảy máu", "đau", "ngã", "té", "ngất", "khẩn cấp", "bị thương", "khó thở", "chóng mặt", "nguy hiểm", "cứu"
];

// --- Schemas ---
const ChatMessageSchema = new mongoose.Schema({
  senderUsername: String,
  targetUsername: String,
  originalText: String,
  translatedText: String,
  sourceLang: String,
  targetLang: String,
  timestamp: { type: Date, default: Date.now, expires: '30d' }
});
const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: String,
    role: String, // 'family', 'caregiver', 'care_recipient'
    lang: { type: String, default: 'zh-TW' },
    bindCode: String,
    boundTo: { type: String, default: null }, // 家屬與看護的綁定
    boundToName: { type: String, default: null },
    patientBoundTo: { type: String, default: null }, // 家屬與受照顧者的綁定
    patientBoundToName: { type: String, default: null }
});
const User = mongoose.model('User', UserSchema);

const LogSchema = new mongoose.Schema({
    senderUsername: String, senderName: String, phrase: String, 
    isDangerous: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now , expires: '7d'}
});
const Log = mongoose.model('Log', LogSchema);

// 血壓紀錄 Schema
const BPSchema = new mongoose.Schema({
    username: String, systolic: Number, diastolic: Number,
    timestamp: { type: Date, default: Date.now }
});
const BP = mongoose.model('BP', BPSchema);

const CustomPhraseSchema = new mongoose.Schema({ ownerUsername: String, content: Object });
const CustomPhrase = mongoose.model('CustomPhrase', CustomPhraseSchema);

const generateBindCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- API ---
app.get('/', (req, res) => res.send('Agent Server 運作中！'));

app.post('/register', async (req, res) => {
    const { username, password, name, role, lang } = req.body;
    try {
        if (await User.findOne({ username })) return res.json({ success: false, message: '帳號已被使用' });
        const newUser = new User({ username, password, name, role, lang: lang || 'zh-TW', bindCode: generateBindCode() });
        await newUser.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: '註冊錯誤' }); }
});

app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username, password: req.body.password });
        if (user) res.json({ success: true, user });
        else res.status(401).json({ success: false, message: '錯誤' });
    } catch (e) { res.json({ success: false }); }
});

// 智慧綁定邏輯 (區分看護與受照顧者)
app.post('/bind', async (req, res) => {
    const { myUsername, targetBindCode } = req.body;
    try {
        const me = await User.findOne({ username: myUsername });
        const target = await User.findOne({ bindCode: targetBindCode });

        if (!me || !target) return res.json({ success: false, message: '無效的綁定碼' });
        
        // 🚨 嚴格一對一檢查
        if (me.boundTo) return res.json({ success: false, message: '您已經綁定過帳號，請先解除綁定！' });
        if (target.boundTo) return res.json({ success: false, message: '對方已經綁定過其他帳號！' });

        // 互相綁定
        me.boundTo = target.username; 
        me.boundToName = target.name;
        target.boundTo = me.username; 
        target.boundToName = me.name;
        
        await me.save(); 
        await target.save();
        res.json({ success: true, targetName: target.name });
    } catch (e) { res.json({ success: false, message: '綁定失敗' }); }
});

app.post('/unbind', async (req, res) => {
    const { username } = req.body;
    try {
        const me = await User.findOne({ username });
        if (me && me.boundTo) {
            // 找到對方，把對方的綁定也清空
            const partner = await User.findOne({ username: me.boundTo });
            if (partner) { 
                partner.boundTo = null; 
                partner.boundToName = null; 
                await partner.save(); 
            }
            // 清空自己的綁定
            me.boundTo = null; 
            me.boundToName = null;
            await me.save();
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// 血壓 API
app.post('/bp', async (req, res) => {
    try {
        const bp = new BP({ username: req.body.username, systolic: req.body.systolic, diastolic: req.body.diastolic });
        await bp.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.get('/bp', async (req, res) => {
    try {
        const bps = await BP.find({ username: req.query.username }).sort({ timestamp: 1 }).limit(14); // 取最近14筆
        res.json(bps);
    } catch (e) { res.json([]); }
});

app.post('/translate', async (req, res) => {
  try {
    const langMap = {
      zh: 'zh-TW', en: 'en', id: 'id',
      vi: 'vi', tl: 'tl', th: 'th'
    };
    const targetLang = langMap[req.body.targetLang] || req.body.targetLang;
    const sourceText = req.body.text;

    // 先用 Gemini 潤飾中文語氣
    const prompt = `以下是一句照護用語，請在不改變意思的情況下，讓語氣變得更親切溫和，適合對長輩說話。只需要回傳修改後的句子，不需要任何解釋。

原句：${sourceText}`;

    const geminiResult = await geminiModel.generateContent(prompt);
    const softText = geminiResult.response.text().trim();
    console.log('Gemini 潤飾結果:', softText);

    // 再翻譯成看護語言
    const result = await translate(softText, { to: targetLang, forceBatch: false });
    console.log('翻譯結果:', result.text);

    res.json({ translatedText: result.text });
  } catch (error) {
    console.log('翻譯錯誤:', error.message);
    res.json({ translatedText: req.body.text });
  }
});

app.post('/track-phrase', async (req, res) => {
    const { username, phrase } = req.body; 
    try {
        const user = await User.findOne({ username });
        const isDangerous = phrase.includes("🆘") || DANGER_KEYWORDS.some(k => phrase.toLowerCase().includes(k.toLowerCase()));
        if(isDangerous && user) {
            const newLog = new Log({ senderUsername: user.username, senderName: user.name, phrase, isDangerous: true });
            await newLog.save();
            console.log(`[危險警告] 已記錄 ${user.name} 的危險語句: ${phrase}`);
        }
        res.json({ success: true });
    } catch (e) {
        console.error('記錄語句失敗:', e); 
        res.json({ success: false }); }
});

app.get('/logs', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.query.username });
        if(!user) return res.json([]);
        let targets = [];
        if (user.role === 'family') targets = [user.boundTo, user.patientBoundTo].filter(Boolean);
        else if (user.role === 'caregiver') {
            const family = await User.findOne({ username: user.boundTo });
            if (family && family.patientBoundTo) targets.push(family.patientBoundTo);
        }
        
        // 👇 計算 7 天前的時間
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        // 👇 查詢時加入 timestamp: { $gte: oneWeekAgo }
        const logs = await Log.find({ 
            senderUsername: { $in: targets }, 
            isDangerous: true,
            timestamp: { $gte: oneWeekAgo } 
        }).sort({ timestamp: -1 }).limit(50);
        
        res.json(logs.map(log => ({
            phrase: log.phrase, senderName: log.senderName,
            time: new Date(log.timestamp).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        })));
    } catch (e) { res.json([]); }
});

// --- 1. 取得自訂語句 ---
app.get('/custom-phrases', async (req, res) => {
    try {
        let targetUser = req.query.username;
        const user = await User.findOne({ username: targetUser });
        
        if (user && user.role === 'caregiver' && user.boundTo) {
            targetUser = user.boundTo; // 看護去抓家屬的語句
        }

        const phrases = await CustomPhrase.find({ ownerUsername: targetUser });
        res.json(phrases.map(p => p.content.text));
    } catch (e) { 
        res.json([]); 
    }
});

// --- 2. 新增自訂語句 ---
app.post('/custom-phrases', async (req, res) => {
    try {
        const newPhrase = new CustomPhrase({ 
            ownerUsername: req.body.username, 
            content: { text: req.body.phrase } 
        });
        await newPhrase.save();
        res.json({ success: true });
    } catch (e) { 
        console.log("儲存失敗:", e);
        res.json({ success: false }); 
    }
});

app.post('/update-lang', async (req, res) => {
    try {
        await User.updateOne({ username: req.body.username }, { lang: req.body.lang });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// 儲存房間連線
const rooms = {};

io.on('connection', (socket) => {
  console.log('新連線:', socket.id);

  // 加入聊天室（依綁定關係）
  socket.on('join_room', ({ username }) => {
    socket.join(username);
    rooms[socket.id] = username;
    console.log(`${username} 加入房間`);
  });

  // 收到訊息後翻譯並廣播
  socket.on('send_message', async ({ senderUsername, targetUsername, text, sourceLang, targetLang }) => {
  try {
    // 查詢接收者的語言設定
    const targetUser = await User.findOne({ username: targetUsername });
    const targetUserLang = targetUser?.lang || 'zh';
    
    const langMap = {
      zh: 'zh-TW', en: 'en', id: 'id',
      vi: 'vi', tl: 'tl', th: 'th'
    };
    const to = langMap[targetUserLang] || 'zh-TW';
    console.log('接收者語言:', targetUserLang, '翻譯到:', to);
    
    const result = await translate(text, { to, forceBatch: false });
    const translatedText = result.text;
    console.log('翻譯結果:', translatedText);

    const message = {
      senderUsername,
      originalText: text,
      translatedText,
      sourceLang,
      targetLang: targetUserLang,
      timestamp: new Date().toISOString(),
    };

    io.to(senderUsername).emit('new_message', { ...message, displayText: text });
    io.to(targetUsername).emit('new_message', { ...message, displayText: translatedText });

    const newMsg = new ChatMessage({
      senderUsername,
      targetUsername,
      originalText: text,
      translatedText,
      sourceLang,
      targetLang: targetUserLang,
    });
    await newMsg.save();

  } catch (e) {
    console.log('訊息處理錯誤:', e.message);
  }
});

  socket.on('disconnect', () => {
    delete rooms[socket.id];
  });
});

app.get('/chat-history', async (req, res) => {
  try {
    const { username, partnerUsername } = req.query;
    const messages = await ChatMessage.find({
      $or: [
        { senderUsername: username, targetUsername: partnerUsername },
        { senderUsername: partnerUsername, targetUsername: username }
      ]
    }).sort({ timestamp: 1 }).limit(50);
    res.json(messages);
  } catch (e) { res.json([]); }
});
// 把 app.listen 換成 server.listen
server.listen(process.env.PORT || 5001, '0.0.0.0', () => console.log('🚀 Server 運行中'));
// 自訂語句 API (保持不變，省略細節以省版面，請保留你原本的 app.get/post/delete('/custom-phrases') 邏輯)
// ... (請將原本的 /custom-phrases 三個路由貼在這裡)

//app.listen(process.env.PORT || 5001, '0.0.0.0', () => console.log(`🚀 Server 運行中`));