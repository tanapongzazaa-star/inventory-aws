// สร้าง/รีเซ็ตรหัสผ่านผู้ใช้ admin
// ใช้: npm run seed -- <username> '<password>' '<ชื่อ-นามสกุล>'
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

(async () => {
  const [username, password, fullName = 'ผู้ดูแลระบบ'] = process.argv.slice(2);
  if (!username || !password) {
    console.error("ใช้: npm run seed -- <username> '<password>' '<ชื่อ-นามสกุล>'");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  const hash = await bcrypt.hash(password, 10);
  await conn.query(
    `INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?, 'admin')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name), role = 'admin'`,
    [username, hash, fullName]
  );
  await conn.end();
  console.log(`พร้อมใช้งาน: admin "${username}"`);
})().catch((e) => {
  console.error('ผิดพลาด:', e.message);
  process.exit(1);
});
