# สถาปัตยกรรมและ ER Diagram

## 1) AWS Architecture (สำหรับสไลด์เดโม)

```mermaid
flowchart LR
  U([ผู้ใช้ / Browser]) -->|HTTP :80| IGW[Internet Gateway]

  subgraph VPC["VPC 10.0.0.0/16 (2 AZ)"]
    IGW --> EC2
    subgraph PUB["Public Subnet (AZ-b)"]
      EC2["EC2 · Ubuntu 24.04<br/>Nginx → Node.js API"]
    end
    subgraph PRV["Private Subnets (AZ-a, AZ-b)"]
      RDS[("RDS MySQL 8.4<br/>Multi-AZ (Primary + Standby)<br/>DB Subnet Group 2 AZ")]
    end
    EC2 -->|3306 ผ่าน bu-lab-database-sg เท่านั้น| RDS
  end

  EC2 -->|Instance Profile: PutObject / presigned GET| S3[(S3 Bucket<br/>รูปสินค้า + รายงาน CSV)]
  EC2 -->|Publish เมื่อสินค้าใกล้หมด| SNS[[SNS Topic]]
  SNS -->|Email| MAIL([ผู้จัดการคลัง])
```

**อธิบายทีละส่วน (ใช้พูดตอนเดโม):**

| ส่วน | เหตุผลการออกแบบ |
|------|-----------------|
| Public Subnet + EC2 | จุดเดียวที่รับทราฟฟิกจากอินเทอร์เน็ต เปิดแค่พอร์ต 80 (และ 22 เฉพาะ IP ผู้ดูแล) |
| Nginx | เสิร์ฟหน้าเว็บ static และ Reverse Proxy `/api/` ไป Node.js ที่ฟังเฉพาะ `127.0.0.1` ภายนอกเข้า API ตรงไม่ได้ |
| Private Subnet + RDS | ฐานข้อมูลไม่มี Public IP, `bu-lab-database-sg` รับ 3306 จาก `bu-lab-network-sg` เท่านั้น (Least Privilege) |
| RDS Multi-AZ | มี Standby คนละ AZ สลับอัตโนมัติเมื่อ Primary ล่ม (High Availability) |
| S3 (private) | เก็บรูปและรายงาน เข้าถึงผ่านลิงก์ชั่วคราว (presigned URL) ไม่เปิดสาธารณะ |
| Instance Profile | ไม่ฝัง Access Key ในโค้ด/เครื่อง |
| SNS | แจ้งเตือนสินค้าใกล้หมดทางอีเมล (ส่งเมื่อยอดเพิ่ง "ข้าม" จุดสั่งซื้อ จึงไม่ส่งรัวทุกครั้ง) |
| ไม่มี NAT Gateway | EC2 อยู่ Public Subnet และ RDS ไม่ต้องออกเน็ต จึงประหยัดงบ $50 ได้มาก |

## 2) การตอบโจทย์ (Requirement Mapping)

| ข้อกำหนดอาจารย์ | ในโปรเจกต์นี้ |
|-----------------|---------------|
| ≥ 4 AWS services (ไม่นับสีม่วง/networking) | EC2, RDS, S3, SNS |
| Working application ที่มีประโยชน์ | ระบบสต็อกสินค้า: Dashboard, CRUD, รับเข้า/ตัดจ่าย, ประวัติ |
| Architecture diagram (เดโม) | แผนภาพข้างบน |
| เอกสารที่กลุ่มอื่นทำตามได้ | `docs/DEPLOY.md` |

## 3) ER Diagram

```mermaid
erDiagram
  users ||--o{ stock_transactions : "ทำรายการ"
  products ||--o{ stock_transactions : "มีประวัติ"
  categories |o--o{ products : "จัดหมวด"

  users {
    int id PK
    varchar username UK
    varchar password_hash
    varchar full_name
    enum role "admin | staff"
    timestamp created_at
  }
  categories {
    int id PK
    varchar name UK
  }
  products {
    int id PK
    varchar sku UK
    varchar name
    int category_id FK
    text description
    varchar unit
    decimal unit_cost
    decimal unit_price
    int quantity "ยอดคงเหลือ >= 0"
    int min_stock "จุดสั่งซื้อ"
    varchar location
    varchar image_key "S3 object key"
    tinyint is_active "soft delete"
    timestamp created_at
    timestamp updated_at
  }
  stock_transactions {
    bigint id PK
    int product_id FK
    int user_id FK
    enum type "IN | OUT"
    int quantity "> 0"
    int balance_after
    varchar reason
    timestamp created_at
  }
```

**แนวคิดสำคัญ:**
- `products.quantity` เป็นยอดปัจจุบัน แก้ได้เฉพาะผ่าน `stock_transactions` (ทำใน DB transaction เดียวกัน) ประวัติจึงตรงกับยอดเสมอ
- `stock_transactions` เพิ่มอย่างเดียว ไม่มีแก้/ลบ เพื่อใช้เป็นหลักฐานตรวจสอบย้อนหลัง
- ลบสินค้าเป็น soft delete (`is_active = 0`) ไม่ทำให้ประวัติหาย
- ยอดตัดจ่ายถูกล็อกด้วย `SELECT ... FOR UPDATE` กันตัดสต็อกซ้อนกันจนติดลบ และมี `CHECK (quantity >= 0)` เป็นด่านสุดท้าย

## 4) API สรุป (ทุกเส้นยกเว้น `/api/health` และ `/api/auth/login` ต้องแนบ `Authorization: Bearer <token>`)

| Method | Path | หน้าที่ |
|--------|------|---------|
| GET | `/api/health` | ตรวจ API และการต่อ DB |
| POST | `/api/auth/login` | เข้าสู่ระบบ รับ JWT |
| GET | `/api/dashboard` | ตัวเลขสรุป, สินค้าใกล้หมด, รายการล่าสุด |
| GET / POST | `/api/categories` | ดู/เพิ่มหมวดหมู่ |
| GET | `/api/products?q=&category_id=&low_stock=1&page=&limit=` | ค้นหา/แบ่งหน้า |
| POST | `/api/products` | เพิ่มสินค้า (multipart, ฟิลด์รูปชื่อ `image`) |
| PUT | `/api/products/:id` | แก้ไข/เปลี่ยนรูป |
| DELETE | `/api/products/:id` | ลบ (admin เท่านั้น) |
| POST | `/api/stock/in` · `/api/stock/out` | `{product_id, quantity, reason}` |
| GET | `/api/history?type=&from=&to=&product_id=` | ประวัติรายการ |
| GET | `/api/reports/export` | สร้าง CSV เก็บ S3 แล้วคืนลิงก์ |
