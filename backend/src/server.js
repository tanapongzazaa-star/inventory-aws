const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ตรวจค่าที่จำเป็นก่อนเริ่ม ถ้าขาดให้หยุดพร้อมบอกชื่อ ดีกว่าพังกลางทาง
for (const k of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'S3_BUCKET', 'JWT_SECRET']) {
  if (!process.env[k]) {
    console.error(`Missing required env: ${k} (ดู backend/.env.example)`);
    process.exit(1);
  }
}

const express = require('express');
const multer = require('multer');
const pool = require('./db');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // อยู่หลัง Nginx
app.use(express.json({ limit: '100kb' }));

// Health check: ไม่ต้อง login (ใช้ทดสอบหลัง deploy)
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

app.use('/api/auth', require('./routes/auth'));

// ทุก route ด้านล่างต้อง login
app.use('/api', requireAuth);
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/history', require('./routes/history'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));

app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบ endpoint' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  let message = err.message;
  if (err.code === 'LIMIT_FILE_SIZE') message = 'ไฟล์รูปต้องไม่เกิน 5MB';
  if (status >= 500) {
    console.error(err);
    message = 'เกิดข้อผิดพลาดภายในระบบ';
  }
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT) || 3000;
// ฟังเฉพาะ localhost: ให้เข้าถึงได้ผ่าน Nginx เท่านั้น
app.listen(port, '127.0.0.1', () => console.log(`Inventory API listening on 127.0.0.1:${port}`));
