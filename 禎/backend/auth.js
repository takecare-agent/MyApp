const jwt = require('jsonwebtoken');

// 這就是「保鑣」函式
module.exports = function(req, res, next) {
  // 1. 從 Header 拿出 token
  // 前端會把 token 放在 'x-auth-token' 或是 'Authorization' 裡
  const token = req.header('x-auth-token');

  // 2. 如果沒 token，直接擋下
  if (!token) {
    return res.status(401).json({ message: '無權限，請先登入 (沒有 Token)' });
  }

  // 3. 驗證 token 是否正確
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // 把解碼後的使用者資料 (id) 存進 req 裡
    next(); // 放行！去找下一個路由
  } catch (err) {
    res.status(401).json({ message: 'Token 無效或過期' });
  }
};
