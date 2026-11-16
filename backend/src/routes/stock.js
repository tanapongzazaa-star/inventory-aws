const express = require('express');
const pool = require('../db');
const { notifyLowStock } = require('../sns');

const router = express.Router();

/**
 * บันทึกรับเข้า (IN) / ตัดจ่าย (OUT) ภายใน DB transaction เดียว
 * - SELECT ... FOR UPDATE ล็อกแถวสินค้า กันสองคนตัดสต็อกพร้อมกันแล้วยอดเพี้ยน
 * - ตัดเกินยอดคงเหลือ -> 409
 * - ส่ง SNS เฉพาะตอนยอดเพิ่ง "ข้าม" จุดสั่งซื้อลงมา (กันอีเมลซ้ำทุกครั้งที่ตัดจ่าย)
 */
function applyStock(type) {
  return async (req, res, next) => {
    const productId = parseInt(req.body.product_id, 10);
    const qty = parseInt(req.body.quantity, 10);
    const reason = String(req.body.reason || '').trim();

    if (!Number.isInteger(productId)) return res.status(400).json({ error: 'ต้องเลือกสินค้า' });
    if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0' });
    if (!reason) return res.status(400).json({ error: 'ต้องระบุเหตุผล' });
    if (reason.length > 255) return res.status(400).json({ error: 'เหตุผลยาวเกิน 255 ตัวอักษร' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT id, sku, name, quantity, min_stock FROM products WHERE id = ? AND is_active = 1 FOR UPDATE',
        [productId]
      );
      const p = rows[0];
      if (!p) {
        await conn.rollback();
        return res.status(404).json({ error: 'ไม่พบสินค้า' });
      }

      const newQty = type === 'IN' ? p.quantity + qty : p.quantity - qty;
      if (newQty < 0) {
        await conn.rollback();
        return res.status(409).json({ error: `สต็อกไม่พอ (คงเหลือ ${p.quantity})` });
      }

      await conn.query('UPDATE products SET quantity = ? WHERE id = ?', [newQty, p.id]);
      const [r] = await conn.query(
        `INSERT INTO stock_transactions (product_id, user_id, type, quantity, balance_after, reason)
         VALUES (?,?,?,?,?,?)`,
        [p.id, req.user.id, type, qty, newQty, reason]
      );
      await conn.commit();

      res.status(201).json({ id: r.insertId, product_id: p.id, type, quantity: qty, balance_after: newQty });

      if (type === 'OUT' && newQty <= p.min_stock && p.quantity > p.min_stock) {
        notifyLowStock({ ...p, quantity: newQty }).catch((e) =>
          console.error('SNS publish failed:', e.message)
        );
      }
    } catch (e) {
      await conn.rollback().catch(() => {});
      next(e);
    } finally {
      conn.release();
    }
  };
}

router.post('/in', applyStock('IN'));
router.post('/out', applyStock('OUT'));

module.exports = router;
