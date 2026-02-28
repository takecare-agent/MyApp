const express = require('express');
const cors = require('cors');
const { translate } = require('google-translate-api-x');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());


const MONGO_URI = 'mongodb://127.0.0.1:27017/demo'; 

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB連線成功(DB:demo)'))
    .catch(err => console.error('MongoDB連線失敗:', err));

//危險關鍵字
const DANGER_KEYWORDS = [
    "救護車", "流血", "痛", "跌倒", "昏倒", "緊急", "受傷", "呼吸困難", "心跳", "不舒服", "想吐", "頭暈", "危險", "求救",
    "ambulance", "bleeding", "pain", "fall", "faint", "emergency", "hurt", "breath", "dizzy", "danger", "help",
    "ambulans", "berdarah", "sakit", "jatuh", "pingsan", "darurat", "luka", "napas", "pusing", "bahaya", "tolong",
    "รถพยาบาล", "เลือดออก", "เจ็บ", "ปวด", "ล้ม", "เป็นลม", "ฉุกเฉิน", "บาดเจ็บ", "หายใจ", "เวียนหัว", "อันตราย", "ช่วยด้วย",
    "cấp cứu", "chảy máu", "đau", "ngã", "té", "ngất", "khẩn cấp", "bị thương", "khó thở", "chóng mặt", "nguy hiểm", "cứu"
];

//Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: String,
    role: String,
    lang: { type: String, default: 'zh-TW' },
    bindCode: String,
    boundTo: { type: String, default: null },
    boundToName: { type: String, default: null }
});
const User = mongoose.model('User', UserSchema);

const LogSchema = new mongoose.Schema({
    senderUsername: String,
    senderName: String,
    phrase: String, 
    isDangerous: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', LogSchema);

const CustomPhraseSchema = new mongoose.Schema({
    ownerUsername: String,
    content: Object 
});
const CustomPhrase = mongoose.model('CustomPhrase', CustomPhraseSchema);

const generateBindCode = () => Math.floor(100000 + Math.random() * 900000).toString();

//API

app.get('/', (req, res) => res.send('Agent Server (DB: demo) 運作中！'));

app.post('/register', async (req, res) => {
    const { username, password, name, role, lang } = req.body;
    try {
        const existing = await User.findOne({ username });
        if (existing) return res.json({ success: false, message: '帳號已被使用' });

        const newUser = new User({
            username, password, name, role,
            lang: lang || 'zh-TW',
            bindCode: generateBindCode()
        });
        await newUser.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: '註冊錯誤' }); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (user) res.json({ success: true, user });
        else res.status(401).json({ success: false, message: '錯誤' });
    } catch (e) { res.json({ success: false }); }
});

app.post('/bind', async (req, res) => {
    const { myUsername, targetBindCode } = req.body;
    try {
        const me = await User.findOne({ username: myUsername });
        const target = await User.findOne({ bindCode: targetBindCode });

        if (!me || !target) return res.json({ success: false, message: '無效代碼' });
        if (me.username === target.username) return res.json({ success: false, message: '不能綁定自己' });
        if (me.boundTo) return res.json({ success: false, message: '您已綁定' });
        if (target.boundTo) return res.json({ success: false, message: '對方已綁定' });

        me.boundTo = target.username;
        me.boundToName = target.name;
        await me.save();

        target.boundTo = me.username;
        target.boundToName = me.name;
        await target.save();

        res.json({ success: true, targetName: target.name });
    } catch (e) { res.json({ success: false, message: '綁定失敗' }); }
});

app.post('/unbind', async (req, res) => {
    const { username } = req.body;
    try {
        const me = await User.findOne({ username });
        if (me && me.boundTo) {
            const partnerUsername = me.boundTo;
            const partner = await User.findOne({ username: partnerUsername });
            
            if (partner) {
                partner.boundTo = null;
                partner.boundToName = null;
                await partner.save();
            }
            me.boundTo = null;
            me.boundToName = null;
            await me.save();

            await Log.deleteMany({ 
                $or: [ { senderUsername: username }, { senderUsername: partnerUsername } ]
            });
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/translate', async (req, res) => {
    const { text, targetLang } = req.body;
    try {
        const result = await translate(text, { to: targetLang, forceBatch: false });
        res.json({ translatedText: result.text });
    } catch (error) { res.json({ translatedText: text }); }
});

app.post('/track-phrase', async (req, res) => {
    const { username, phrase } = req.body; 
    try {
        const user = await User.findOne({ username });
        if (!user) return res.json({ success: false });

        const isDangerous = DANGER_KEYWORDS.some(keyword => phrase.toLowerCase().includes(keyword.toLowerCase()));

        const newLog = new Log({
            senderUsername: user.username,
            senderName: user.name,
            phrase: phrase,
            isDangerous: isDangerous
        });
        await newLog.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.get('/logs', async (req, res) => {
    const { targetUsername } = req.query;
    try {
        const logs = await Log.find({ senderUsername: targetUsername, isDangerous: true })
                              .sort({ timestamp: -1 })
                              .limit(50);
        
        const formattedLogs = logs.map(log => ({
            phrase: log.phrase,
            time: new Date(log.timestamp).toLocaleString('zh-TW', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
            isDangerous: true
        }));
        res.json(formattedLogs);
    } catch (e) { res.json([]); }
});

app.get('/custom-phrases', async (req, res) => {
    const { username } = req.query;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.json([]);
        let targetOwner = user.username;
        if (user.role === 'caregiver' && user.boundTo) targetOwner = user.boundTo;
        const phrases = await CustomPhrase.find({ ownerUsername: targetOwner });
        res.json(phrases.map(p => ({ id: p._id, ...p.content })));
    } catch (e) { res.json([]); }
});

app.post('/custom-phrases', async (req, res) => {
    const { username, phrase } = req.body;
    try {
        const [en, id, th, vi] = await Promise.all([
            translate(phrase, { to: 'en', forceBatch: false }).then(r => r.text).catch(() => phrase),
            translate(phrase, { to: 'id', forceBatch: false }).then(r => r.text).catch(() => phrase),
            translate(phrase, { to: 'th', forceBatch: false }).then(r => r.text).catch(() => phrase),
            translate(phrase, { to: 'vi', forceBatch: false }).then(r => r.text).catch(() => phrase),
        ]);
        const content = { 'zh-TW': phrase, 'en': en, 'id': id, 'th': th, 'vi': vi };
        const newPhrase = new CustomPhrase({ ownerUsername: username, content: content });
        await newPhrase.save();
        const allPhrases = await CustomPhrase.find({ ownerUsername: username });
        res.json({ success: true, phrases: allPhrases.map(p => ({ id: p._id, ...p.content })) });
    } catch (error) { res.json({ success: false }); }
});

app.delete('/custom-phrases', async (req, res) => {
    const { username, phraseId } = req.body;
    try {
        await CustomPhrase.findByIdAndDelete(phraseId);
        const allPhrases = await CustomPhrase.find({ ownerUsername: username });
        res.json({ success: true, phrases: allPhrases.map(p => ({ id: p._id, ...p.content })) });
    } catch (e) { res.json({ success: false }); }
});

const PORT = 5001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Agent Server 運行於 port ${PORT}`);
});