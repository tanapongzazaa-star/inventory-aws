const jwt = require('jsonwebtoken');

/** ตรวจ JWT จาก header: Authorization: Bearer <token> */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, username, full_name, role }
    next();
  } catch {
    res.status(401).json({ error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'ต้องเป็นผู้ดูแลระบบ (admin)' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
