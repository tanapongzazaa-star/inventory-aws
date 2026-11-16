const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/dashboard -> ตัวเลขสรุป + รายการใกล้หมด + รายการล่าสุด
router.get('/', async (req, res, next) => {
  try {
    const [[t]] = await pool.query(
      `SELECT COUNT(*)                              AS total_products,
              COALESCE(SUM(quantity), 0)            AS total_units,
              COALESCE(SUM(quantity * unit_cost), 0) AS stock_value,
              COALESCE(SUM(quantity <= min_stock), 0) AS low_stock_count
         FROM products WHERE is_active = 1`
    );
    const [low] = await pool.query(
      `SELECT id, sku, name, quantity, min_stock, unit
         FROM products
        WHERE is_active = 1 AND quantity <= min_stock
        ORDER BY (quantity - min_stock) ASC, name
        LIMIT 10`
    );
    const [recent] = await pool.query(
      `SELECT t.id, t.type, t.quantity, t.balance_after, t.reason, t.created_at,
              p.sku, p.name AS product_name, u.full_name AS performed_by
         FROM stock_transactions t
         JOIN products p ON p.id = t.product_id
         JOIN users u ON u.id = t.user_id
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT 8`
    );

    res.json({
      totals: {
        total_products: Number(t.total_products),
        total_units: Number(t.total_units),
        stock_value: Number(t.stock_value),
        low_stock_count: Number(t.low_stock_count),
      },
      low_stock: low,
      recent,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
