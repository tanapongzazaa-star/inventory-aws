const express = require('express');
const pool = require('../db');
const s3 = require('../s3');

const router = express.Router();

// กัน CSV/Formula injection เมื่อเปิดใน Excel (เซลล์ที่ขึ้นต้นด้วย = + - @ )
function cell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// GET /api/reports/export -> สร้างรายงานสรุปสต็อกเป็น CSV เก็บใน S3 แล้วคืนลิงก์ดาวน์โหลด (หมดอายุใน 10 นาที)
router.get('/export', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.sku, p.name, COALESCE(c.name, '') AS category, p.unit, p.quantity, p.min_stock,
              p.unit_cost, p.unit_price, (p.quantity * p.unit_cost) AS stock_value,
              COALESCE(p.location, '') AS location
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1
        ORDER BY p.sku`
    );

    const header = ['SKU', 'ชื่อสินค้า', 'หมวดหมู่', 'หน่วย', 'คงเหลือ', 'Min stock', 'ต้นทุน/หน่วย', 'ราคาขาย', 'มูลค่าสต็อก', 'ตำแหน่ง'];
    const lines = [header.map(cell).join(',')];
    for (const r of rows) {
      lines.push(
        [r.sku, r.name, r.category, r.unit, r.quantity, r.min_stock, r.unit_cost, r.unit_price, r.stock_value, r.location]
          .map(cell)
          .join(',')
      );
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `stock-summary-${stamp}.csv`;
    const key = `reports/${fileName}`;
    // ﻿ (BOM) ทำให้ Excel อ่านภาษาไทยได้ถูกต้อง
    await s3.uploadRaw(key, Buffer.from('﻿' + lines.join('\r\n'), 'utf8'), 'text/csv; charset=utf-8');

    res.json({ key, rows: rows.length, url: await s3.signedUrl(key, 600, fileName) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
