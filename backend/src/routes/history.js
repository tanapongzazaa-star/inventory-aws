const express = require('express');
const pool = require('../db');

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/history?product_id=&type=IN|OUT&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const where = ['1=1'];
    const params = [];
    if (req.query.product_id) {
      where.push('t.product_id = ?');
      params.push(Number(req.query.product_id));
    }
    if (['IN', 'OUT'].includes(req.query.type)) {
      where.push('t.type = ?');
      params.push(req.query.type);
    }
    if (DATE_RE.test(req.query.from || '')) {
      where.push('t.created_at >= ?');
      params.push(req.query.from);
    }
    if (DATE_RE.test(req.query.to || '')) {
      where.push('t.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(req.query.to);
    }
    const w = where.join(' AND ');

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM stock_transactions t WHERE ${w}`, params);
    const [items] = await pool.query(
      `SELECT t.id, t.type, t.quantity, t.balance_after, t.reason, t.created_at,
              p.id AS product_id, p.sku, p.name AS product_name, u.full_name AS performed_by
         FROM stock_transactions t
         JOIN products p ON p.id = t.product_id
         JOIN users u ON u.id = t.user_id
        WHERE ${w}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ items, total, page, limit });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
