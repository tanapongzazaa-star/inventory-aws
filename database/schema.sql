-- ============================================================
-- Cloud Inventory Management System  |  MySQL 8.x (Amazon RDS)
-- ใช้งาน:  mysql -h <rds-endpoint> -u admin -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS inventory_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inventory_db;

-- ------------------------------------------------------------
-- users: ผู้ใช้ระบบ (บันทึกว่าใครเป็นผู้ทำรายการ)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,            -- bcrypt hash ไม่เก็บรหัสผ่านจริง
  full_name     VARCHAR(100) NOT NULL,
  role          ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- categories: หมวดหมู่สินค้า
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- products: สินค้า (quantity = ยอดคงเหลือปัจจุบัน แก้ผ่าน stock_transactions เท่านั้น)
-- image_key = ชื่อ object ใน S3 (ไม่เก็บ URL เพราะ bucket เป็น private)
-- is_active = ลบแบบ soft delete เพื่อไม่ให้ประวัติรายการหาย
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku         VARCHAR(50)  NOT NULL,
  name        VARCHAR(200) NOT NULL,
  category_id INT UNSIGNED NULL,
  description TEXT NULL,
  unit        VARCHAR(30)  NOT NULL DEFAULT 'ชิ้น',
  unit_cost   DECIMAL(12,2) NOT NULL DEFAULT 0.00,   -- ต้นทุนต่อหน่วย (ใช้คำนวณมูลค่าสต็อก)
  unit_price  DECIMAL(12,2) NOT NULL DEFAULT 0.00,   -- ราคาขาย
  quantity    INT NOT NULL DEFAULT 0,
  min_stock   INT NOT NULL DEFAULT 0,                -- ต่ำกว่าหรือเท่ากับค่านี้ = ใกล้หมด
  location    VARCHAR(100) NULL,                     -- ตำแหน่งในคลัง เช่น A-01-03
  image_key   VARCHAR(255) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_name (name),
  KEY idx_products_active_qty (is_active, quantity),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT chk_products_qty   CHECK (quantity >= 0),
  CONSTRAINT chk_products_cost  CHECK (unit_cost >= 0 AND unit_price >= 0),
  CONSTRAINT chk_products_min   CHECK (min_stock >= 0)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- stock_transactions: ประวัติรับเข้า/ตัดจ่าย (History Log) เพิ่มอย่างเดียว ไม่แก้ไข/ลบ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_transactions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id    INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  type          ENUM('IN','OUT') NOT NULL,
  quantity      INT NOT NULL,                       -- จำนวนที่รับเข้า/ตัดจ่าย (เป็นบวกเสมอ)
  balance_after INT NOT NULL,                       -- ยอดคงเหลือหลังทำรายการ
  reason        VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tx_product_time (product_id, created_at),
  KEY idx_tx_time (created_at),
  CONSTRAINT fk_tx_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_tx_user    FOREIGN KEY (user_id)    REFERENCES users (id),
  CONSTRAINT chk_tx_qty    CHECK (quantity > 0 AND balance_after >= 0)
) ENGINE=InnoDB;

-- ข้อมูลเริ่มต้น
INSERT IGNORE INTO categories (name) VALUES
  ('อุปกรณ์อิเล็กทรอนิกส์'),
  ('เครื่องเขียนและสำนักงาน'),
  ('อาหารและเครื่องดื่ม'),
  ('อื่นๆ');
