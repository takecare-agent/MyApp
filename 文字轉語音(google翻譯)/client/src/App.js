import React, { useState } from 'react';
import axios from 'axios';

const languages = [
  { code: 'zh-CN', name: '中文' },
  { code: 'en', name: '英文' },
  { code: 'id', name: '印尼文' },
  { code: 'th', name: '泰文' },
  { code: 'vi', name: '越南語' }
];

function App() {
  const [text, setText] = useState('');
  const [targetLang, setTargetLang] = useState('en');
  const [result, setResult] = useState('');

  const handleTranslate = async () => {
    if (!text) return;
    try {
      const response = await axios.post('http://localhost:5001/translate', {
        text,
        targetLang
      });
      setResult(response.data.translatedText);
    } catch (error) {
      alert('翻譯發生錯誤');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: 'auto' }}>
      <h2>多國語言翻譯器</h2>
      <textarea 
        rows="4" 
        style={{ width: '100%' }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="請輸入要翻譯的文字..."
      />
      
      <div style={{ margin: '10px 0' }}>
        <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
          {languages.map(lang => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>
        <button onClick={handleTranslate} style={{ marginLeft: '10px' }}>翻譯</button>
      </div>

      <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <strong>結果：</strong>
        <p>{result}</p>
      </div>
    </div>
  );
}

export default App;