const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// POST /api/auth/login  { username, password } -> { token, user }
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, password_hash, full_name, role FROM users WHERE username = ?',
      [String(username)]
    );
    const u = rows[0];
    const ok = u && (await bcrypt.compare(String(password), u.password_hash));
    if (!ok) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const user = { id: u.id, username: u.username, full_name: u.full_name, role: u.role };
    const token = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });
    res.json({ token, user });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
