const express = require('express');
const multer = require('multer');
const pool = require('../db');
const s3 = require('../s3');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// รับไฟล์รูปไว้ใน memory (สูงสุด 5MB, เฉพาะ JPG/PNG/WEBP) แล้วส่งต่อขึ้น S3
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    const err = new Error('รองรับเฉพาะไฟล์ JPG, PNG, WEBP');
    err.status = 400;
    cb(err);
  },
});

const withImageUrl = async (row) => ({
  ...row,
  image_url: row.image_key ? await s3.signedUrl(row.image_key) : null,
});

function parseProduct(body) {
  const errors = [];
  const sku = String(body.sku || '').trim();
  const name = String(body.name || '').trim();
  const unit_cost = Number(body.unit_cost ?? 0);
  const unit_price = Number(body.unit_price ?? 0);
  const min_stock = parseInt(body.min_stock ?? 0, 10);

  if (!sku) errors.push('ต้องระบุ SKU');
  if (!name) errors.push('ต้องระบุชื่อสินค้า');
  if (!(unit_cost >= 0) || !(unit_price >= 0)) errors.push('ราคา/ต้นทุนต้องไม่ติดลบ');
  if (!Number.isInteger(min_stock) || min_stock < 0) errors.push('จุดสั่งซื้อ (min stock) ต้องเป็นจำนวนเต็มไม่ติดลบ');

  return {
    errors,
    data: {
      sku,
      name,
      category_id: body.category_id ? Number(body.category_id) : null,
      description: String(body.description || '').trim() || null,
      unit: String(body.unit || 'ชิ้น').trim() || 'ชิ้น',
      unit_cost,
      unit_price,
      min_stock,
      location: String(body.location || '').trim() || null,
    },
  };
}

// GET /api/products?q=&category_id=&low_stock=1&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const where = ['p.is_active = 1'];
    const params = [];
    if (req.query.q) {
      where.push('(p.name LIKE ? OR p.sku LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like);
    }
    if (req.query.category_id) {
      where.push('p.category_id = ?');
      params.push(Number(req.query.category_id));
    }
    if (req.query.low_stock === '1') where.push('p.quantity <= p.min_stock');
    const w = where.join(' AND ');

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM products p WHERE ${w}`, params);
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${w}
        ORDER BY p.updated_at DESC, p.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ items: await Promise.all(rows.map(withImageUrl)), total, page, limit });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ? AND p.is_active = 1`,
      [Number(req.params.id)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    res.json(await withImageUrl(rows[0]));
  } catch (e) {
    next(e);
  }
});

// POST /api/products  (multipart/form-data, ฟิลด์ไฟล์ชื่อ "image")
// initial_quantity > 0 จะสร้างรายการ IN "ยอดยกมา" ให้ ประวัติจึงตรงกับยอดคงเหลือเสมอ
router.post('/', upload.single('image'), async (req, res, next) => {
  const { errors, data } = parseProduct(req.body);
  const initial = Math.max(0, parseInt(req.body.initial_quantity, 10) || 0);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  let imageKey = null;
  const conn = await pool.getConnection();
  try {
    if (req.file) imageKey = await s3.uploadImage(req.file);

    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO products
         (sku, name, category_id, description, unit, unit_cost, unit_price, quantity, min_stock, location, image_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [data.sku, data.name, data.category_id, data.description, data.unit, data.unit_cost,
       data.unit_price, initial, data.min_stock, data.location, imageKey]
    );
    if (initial > 0) {
      await conn.query(
        `INSERT INTO stock_transactions (product_id, user_id, type, quantity, balance_after, reason)
         VALUES (?,?,?,?,?,?)`,
        [r.insertId, req.user.id, 'IN', initial, initial, 'ยอดยกมา (สร้างสินค้า)']
      );
    }
    await conn.commit();
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    await conn.rollback().catch(() => {});
    if (imageKey) s3.remove(imageKey).catch(() => {});
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'SKU นี้มีอยู่แล้ว' });
    next(e);
  } finally {
    conn.release();
  }
});

// PUT /api/products/:id  (แก้ข้อมูล/เปลี่ยนรูป — ยอดคงเหลือแก้ผ่าน /api/stock เท่านั้น)
router.put('/:id', upload.single('image'), async (req, res, next) => {
  const id = Number(req.params.id);
  const { errors, data } = parseProduct(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  let newKey = null;
  try {
    const [rows] = await pool.query('SELECT image_key FROM products WHERE id = ? AND is_active = 1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    const oldKey = rows[0].image_key;

    if (req.file) newKey = await s3.uploadImage(req.file);

    await pool.query(
      `UPDATE products SET sku=?, name=?, category_id=?, description=?, unit=?, unit_cost=?,
              unit_price=?, min_stock=?, location=?, image_key=?
        WHERE id = ?`,
      [data.sku, data.name, data.category_id, data.description, data.unit, data.unit_cost,
       data.unit_price, data.min_stock, data.location, newKey || oldKey, id]
    );
    if (newKey && oldKey) s3.remove(oldKey).catch(() => {});
    res.json({ id });
  } catch (e) {
    if (newKey) s3.remove(newKey).catch(() => {});
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'SKU นี้มีอยู่แล้ว' });
    next(e);
  }
});

// DELETE /api/products/:id  (admin เท่านั้น, soft delete เพื่อเก็บประวัติรายการไว้)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const [r] = await pool.query('UPDATE products SET is_active = 0 WHERE id = ? AND is_active = 1', [
      Number(req.params.id),
    ]);
    if (!r.affectedRows) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
