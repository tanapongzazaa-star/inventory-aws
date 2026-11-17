# คำสั่งสำหรับก๊อปวาง (ใช้คู่กับคู่มือสไลด์ภาพ)

กดปุ่ม **Copy** มุมขวาบนของแต่ละบล็อก แล้ววางในหน้าจอดำของ EC2

- **วางในหน้าจอ EC2 Instance Connect (ในเบราว์เซอร์):** กด **Ctrl+Shift+V** หรือคลิกขวาแล้วเลือก **Paste** (กด Ctrl+V อย่างเดียวจะไม่ได้)
- วางทีละบล็อก กด Enter แล้วรอจนขึ้นบรรทัด `ubuntu@...$` ใหม่ ก่อนวางบล็อกถัดไป
- ถ้ามีหน้าต่างสีม่วงหรือน้ำเงินถามเรื่อง restart services ให้กด **Enter** ผ่านไป
- **ค้างที่ประมาณ 96%** (ขั้น *Processing triggers for man-db*) เป็นเรื่องปกติบน t3.micro **รอ 2–3 นาที** จะผ่านไปเอง ถ้าเกิน 5 นาทีให้กด Ctrl+C แล้วรัน `sudo dpkg --configure -a`

---

## บล็อก 1 · ติดตั้ง Nginx, MySQL client, git (สไลด์ 12)

```bash
sudo apt update && sudo NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive apt install -y nginx mysql-client git curl
```

## บล็อก 2 · ติดตั้ง Node.js 22 (สไลด์ 12)

> ⚠️ **วางทีละบรรทัด** บรรทัดแรกจะนิ่งไม่ขึ้นอะไรประมาณ 20–60 วินาที **ห้ามกด Ctrl+C** รอจนกลับมาที่ `ubuntu@...# คำสั่งสำหรับก๊อปวาง (ใช้คู่กับคู่มือสไลด์ภาพ)

กดปุ่ม **Copy** มุมขวาบนของแต่ละบล็อก แล้ววางในหน้าจอดำของ EC2

- **วางในหน้าจอ EC2 Instance Connect (ในเบราว์เซอร์):** กด **Ctrl+Shift+V** หรือคลิกขวาแล้วเลือก **Paste** (กด Ctrl+V อย่างเดียวจะไม่ได้)
- วางทีละบล็อก กด Enter แล้วรอจนขึ้นบรรทัด `ubuntu@...$` ใหม่ ก่อนวางบล็อกถัดไป
- ถ้ามีหน้าต่างสีม่วงหรือน้ำเงินถามเรื่อง restart services ให้กด **Enter** ผ่านไป
- **ค้างที่ประมาณ 96%** (ขั้น *Processing triggers for man-db*) เป็นเรื่องปกติบน t3.micro **รอ 2–3 นาที** จะผ่านไปเอง ถ้าเกิน 5 นาทีให้กด Ctrl+C แล้วรัน `sudo dpkg --configure -a`

---

## บล็อก 1 · ติดตั้ง Nginx, MySQL client, git (สไลด์ 12)

```bash
sudo apt update && sudo NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive apt install -y nginx mysql-client git curl
```


> ถ้าเผลอขัด ระบบจะติดตั้ง Node.js 18 ของ Ubuntu ที่ไม่มี npm แล้วจะพังที่บล็อก 5 แก้ได้ด้วยการรันบล็อกนี้ใหม่ตั้งแต่บรรทัดแรก

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
```

```bash
sudo NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive apt install -y nodejs
```

```bash
node -v; npm -v
```

ต้องขึ้น `v22.x` และเลข npm `10.x` ถ้าขึ้น `v18` หรือ `npm: command not found` ให้รันบรรทัดแรกของบล็อกนี้ใหม่

## บล็อก 3 · ดึงโค้ดจาก GitHub (สไลด์ 12)

```bash
sudo mkdir -p /opt/inventory && sudo chown ubuntu:ubuntu /opt/inventory
git clone https://github.com/tanapongzazaa-star/inventory-aws.git /opt/inventory
ls /opt/inventory
```

ต้องเห็น `backend  database  deploy  docs  frontend`

---

> **ก่อนทำบล็อก 4:** รอให้ RDS ขึ้นสถานะ **Available** แล้วก๊อป **Endpoint** จาก RDS → เลือกฐานข้อมูล → แท็บ Connectivity & security

## บล็อก 4 · สร้างตารางในฐานข้อมูล (สไลด์ 13)

แก้ `<RDS-ENDPOINT>` เป็น endpoint ของคุณก่อนกด Enter แล้วใส่รหัสผ่าน DB ตอนที่ระบบถาม (ตัวอักษรจะไม่ขึ้นบนจอ เป็นเรื่องปกติ)

```bash
mysql -h <RDS-ENDPOINT> -u admin -p < /opt/inventory/database/schema.sql
```

## บล็อก 5 · ติดตั้งแพ็กเกจและเตรียมไฟล์ .env (สไลด์ 13)

```bash
cd /opt/inventory/backend
npm install --omit=dev
cp .env.example .env
openssl rand -hex 32
```

ก๊อปตัวอักษรยาว ๆ ที่ได้จากบรรทัดสุดท้ายเก็บไว้ (ใช้เป็น `JWT_SECRET`)

## บล็อก 6 · แก้ไฟล์ .env (สไลด์ 13)

```bash
nano .env
```

แก้ 5 บรรทัดนี้ให้เป็นค่าของคุณ (ใช้ลูกศรเลื่อน แก้แล้วกด **Ctrl+O** → **Enter** → **Ctrl+X**)

| บรรทัด | ใส่อะไร |
|---|---|
| `DB_HOST=` | RDS endpoint |
| `DB_PASSWORD=` | รหัสผ่าน DB ที่ตั้งตอนสร้าง RDS |
| `S3_BUCKET=` | ชื่อ bucket |
| `SNS_TOPIC_ARN=` | ARN ของ topic `inventory-low-stock` |
| `JWT_SECRET=` | ตัวอักษรจาก `openssl rand -hex 32` |

จากนั้น

```bash
chmod 600 .env
```

> ห้ามแคปหน้าจอตอนเปิด `.env` และห้ามอัปไฟล์ `.env` ขึ้น GitHub

## บล็อก 7 · สร้างผู้ใช้ admin (สไลด์ 13)

แก้ `รหัสผ่านใหม่อย่างน้อย8ตัว` เป็นรหัสผ่านที่จะใช้ล็อกอินเว็บก่อนกด Enter

```bash
cd /opt/inventory/backend
npm run seed -- admin 'รหัสผ่านใหม่อย่างน้อย8ตัว' 'ผู้ดูแลระบบ'
```

## บล็อก 8 · ให้ API รันเป็น service (สไลด์ 14)

```bash
sudo cp /opt/inventory/deploy/systemd/inventory.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now inventory
```

## บล็อก 9 · ตั้ง Nginx (สไลด์ 14)

```bash
sudo mkdir -p /var/www/inventory && sudo cp -r /opt/inventory/frontend/* /var/www/inventory/
sudo cp /opt/inventory/deploy/nginx/inventory.conf /etc/nginx/sites-available/inventory
sudo ln -sf /etc/nginx/sites-available/inventory /etc/nginx/sites-enabled/inventory
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

## บล็อก 10 · ตรวจผล (สไลด์ 14)

```bash
curl -s http://127.0.0.1/api/health
```

ต้องได้ `{"status":"ok","db":"up"}` แล้วเปิดเบราว์เซอร์ไปที่ `http://<EC2-PUBLIC-IP>` ล็อกอินด้วย `admin` และรหัสผ่านจากบล็อก 7

---

## ถ้าติด

| อาการ | คำสั่งดูสาเหตุ / แก้ |
|---|---|
| เว็บขึ้น 502 Bad Gateway | `journalctl -u inventory -n 50 --no-pager` |
| health ได้ `db: down` | ตรวจ `DB_HOST` และ `DB_PASSWORD` ใน `.env` แล้ว `sudo systemctl restart inventory` |
| เว็บขึ้น Welcome to nginx | `sudo rm -f /etc/nginx/sites-enabled/default && sudo systemctl restart nginx` |
| แก้ `.env` แล้วยังไม่เปลี่ยน | `sudo systemctl restart inventory` |
| `npm: command not found` หรือ node เป็น v18 | รันบล็อก 2 ใหม่ตั้งแต่บรรทัดแรก ห้ามกด Ctrl+C |
| apt ค้างที่ 96% นานเกิน 5 นาที | Ctrl+C แล้ว `sudo dpkg --configure -a` แล้วรันบล็อกเดิมซ้ำ |

ติดตั้งเสร็จแล้ว กลับไปแก้ SSH 22 ใน `bu-lab-network-sg` เป็น **My IP**
