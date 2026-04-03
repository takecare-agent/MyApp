require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000; // Render 會自動分配 Port

app.use(cors());
app.use(bodyParser.json());

let bpRecords = []; // 暫存紀錄

const mongoURI = process.env.MONGO_URI; 


const mongoose = require('mongoose');


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB 連線成功！'))
  .catch(err => console.error('連線失敗：', err));

const RecordSchema = new mongoose.Schema({
  sys: String,
  dia: String,
  level: String,
  time: { type: String, default: () => new Date().toLocaleString('zh-TW') }
});

const Record = mongoose.model('Record', RecordSchema);

app.post('/api/bp', async (req, res) => {
  try {
    const newRecord = new Record(req.body);
    await newRecord.save();
    res.status(201).send(newRecord);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/bp', async (req, res) => {
  try {
    const records = await Record.find().sort({ _id: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.listen(PORT, () => {
    console.log(`後端伺服器啟動成功：http://localhost:${PORT}`);
});