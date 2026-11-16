const mysql = require('mysql2/promise');

// Connection pool เดียวใช้ร่วมทั้งแอป (เรียกหลัง dotenv โหลดแล้วใน server.js)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',          // TIMESTAMP เก็บเป็น UTC แล้วให้หน้าเว็บแปลงเป็นเวลาไทย
  decimalNumbers: true,   // DECIMAL/SUM ส่งกลับเป็น number ไม่ใช่ string
});

module.exports = pool;
