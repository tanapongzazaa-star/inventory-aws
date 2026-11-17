# คู่มือ Deploy: Cloud Inventory บน AWS Learner Lab (EC2 + Nginx + RDS + S3 + SNS)

> 📸 **อยากดูเป็นภาพทีละขั้น:** [คู่มือติดตั้งแบบสไลด์ภาพ (16 หน้า)](https://claude.ai/artifact/LaitF9ckP2U7dUkWRinsx4) ภาพจากการติดตั้งจริงทุกขั้น ใช้ดูคู่กับเอกสารนี้

คู่มือนี้เขียนให้ทีมอื่นทำตามบน **AWS Learner Lab ของตัวเอง** จนได้ระบบที่ใช้งานได้จริง ใช้เวลาประมาณ **35–45 นาที**
ชื่อ resource ใช้ตามที่สอนใน **Lab 7: Configure Web and Database** (VPC, Security Group, RDS, EC2 Ubuntu)
ค่าที่ต้องจดไว้ใช้ต่อ: `<BUCKET>` `<RDS-ENDPOINT>` `<SNS-ARN>` `<EC2-PUBLIC-IP>`

## ลำดับที่ทำให้เสร็จใน 45 นาที

RDS แบบ Multi-AZ ใช้เวลาสร้าง 10–20 นาที จึง**สั่งสร้าง RDS ก่อน แล้วทำ SNS กับ EC2 ระหว่างรอ**

| ช่วง | ทำอะไร | เวลาโดยประมาณ |
|------|--------|----------------|
| 1 | ข้อ 1 S3 → ข้อ 2 VPC → ข้อ 3 Security Groups | 8 นาที |
| 2 | ข้อ 4 สั่งสร้าง RDS (กด Create แล้วไม่ต้องรอ) | 5 นาที |
| 3 | **ระหว่างรอ RDS:** ข้อ 5 SNS → ข้อ 6 EC2 → ข้อ 7.1–7.3 ติดตั้งซอฟต์แวร์และดึงโค้ด | 12 นาที |
| 4 | เมื่อ RDS ขึ้น **Available**: ข้อ 7.4–7.8 ตั้งค่าฐานข้อมูลและรันระบบ | 8 นาที |
| 5 | ข้อ 8 ทดสอบ และเก็บหลักฐานส่งกลับ | 5–10 นาที |

> ถ้าใน Learner Lab ของคุณมี VPC และ Security Group จาก Lab 7 อยู่แล้ว ใช้ของเดิมได้เลย ข้ามข้อ 2–3 แต่ต้องตรวจกฎของ SG ให้ตรงกับข้อ 3

> เมนูหรือชื่อปุ่มใน AWS Console อาจต่างจากคู่มือเล็กน้อย ถ้าไม่ตรงให้ยึดเจตนาของแต่ละขั้น
> ใช้ Region **us-east-1** เหมือนกันทุกบริการ

---

## 0) ก่อนเริ่ม

**บริการที่นับตามโจทย์ (ไม่นับ VPC/IAM/CloudWatch ซึ่งเป็นสีม่วง):**

| # | บริการ | หน้าที่ |
|---|--------|---------|
| 1 | Amazon EC2 | รัน Nginx + Node.js API |
| 2 | Amazon RDS (MySQL) | ฐานข้อมูล |
| 3 | Amazon S3 | รูปสินค้า + ไฟล์รายงาน CSV |
| 4 | Amazon SNS | อีเมลแจ้งเตือนสินค้าใกล้หมด |

**เช็กเครดิตก่อน:** เข้า Learner Lab ดูแถบงบประมาณ (Budget) ว่าเหลือเท่าไร ถ้าเหลือน้อยหรือติดปัญหาให้ติดต่ออาจารย์ทันที

**ค่าตามแล็บ 7 ที่ใช้ในคู่มือนี้**

| หัวข้อ | ค่า |
|--------|-----|
| VPC | `bu-lab-network-vpc` (10.0.0.0/16) |
| Security Group | `bu-lab-network-sg` (เว็บ), `bu-lab-database-sg` (ฐานข้อมูล) |
| DB Subnet Group | `bu-lab-db-group` (Private Subnet 2 AZ) |
| RDS | MySQL 8.4.x, Dev/Test, **Multi-AZ**, `db.t3.micro`, 20 GiB |
| EC2 | **Ubuntu Server 24.04 LTS**, `t3.micro`, key pair `vockey`, Public Subnet ของ us-east-1b |

**ข้อควรรู้เรื่องงบ ($50):**
- **NAT Gateway:** แล็บสร้างไว้ แต่โปรเจกต์นี้ไม่ต้องใช้ เพราะ EC2 อยู่ใน Public Subnet (ออกเน็ตผ่าน Internet Gateway) และ RDS ไม่ต้องออกเน็ต
  คิดเงินรายชั่วโมงตลอดที่เปิดอยู่ (ราว $1 ต่อวัน ตรวจราคาจริงที่ AWS Pricing Calculator) จึงตั้งเป็น **None**
- **RDS Multi-AZ:** ใช้ตามแล็บ ราคาประมาณสองเท่าของ Single-AZ แต่ยังอยู่ในงบ และได้ High Availability
  ถ้าเครดิตตึง เปลี่ยนเป็น Single-AZ ได้ที่ขั้น 4.2 (ระบบทำงานเหมือนเดิม และสร้างเร็วกว่า)
- **ทำเสร็จและตรวจแล้ว** ให้ลบทรัพยากรตามข้อ 9 เพื่อไม่ให้เครดิตหมด
- ดูยอดเครดิตทุกครั้งที่เริ่มและหยุดทำงาน

---

## 1) สร้าง S3 Bucket (เก็บรูป + รายงาน)

1. S3 → **Create bucket**
2. Bucket name: ชื่อที่ไม่ซ้ำใครทั้งโลก เช่น `inv-<รหัสนักศึกษา>-<ตัวเลขสุ่ม 3 หลัก>` → จดเป็น `<BUCKET>`
3. Region: us-east-1
4. **Block all public access = เปิดไว้ (ติ๊กครบ)** (Private Bucket ตามที่สอนใน Lab 10) แอปใช้ลิงก์ชั่วคราว (presigned URL) ดูรูป
5. Encryption: ค่าเริ่มต้น (SSE-S3) แล้วกด Create

## 2) สร้าง VPC (Multi-AZ: 2 Public + 2 Private Subnet)

VPC → **Create VPC** → เลือก **VPC and more**

| ช่อง | ค่า |
|------|-----|
| Name tag (Auto-generate) | `bu-lab-network` (จะได้ VPC ชื่อ `bu-lab-network-vpc`) |
| IPv4 CIDR | `10.0.0.0/16` |
| Number of AZs | 2 (`us-east-1a`, `us-east-1b`) |
| Public subnets | 2 |
| Private subnets | 2 |
| NAT gateways | **None** (ดูหัวข้องบ ด้านบน) |
| VPC endpoints | **S3 Gateway** (ไม่มีค่าใช้จ่าย; Wizard ผูกกับ route table ของ private subnet ให้อัตโนมัติ) |
| DNS hostnames / DNS resolution | เปิดทั้งคู่ |

กด **Customize subnets CIDR blocks** แล้วตั้งตามแล็บ 7:

| Subnet | AZ | CIDR |
|--------|----|------|
| `bu-lab-network-subnet-public1-us-east-1a` | us-east-1a | `10.0.0.0/24` |
| `bu-lab-network-subnet-private1-us-east-1a` | us-east-1a | `10.0.1.0/24` |
| `bu-lab-network-subnet-public2-us-east-1b` ← **วาง EC2 ที่นี่** | us-east-1b | `10.0.30.0/24` |
| `bu-lab-network-subnet-private2-us-east-1b` | us-east-1b | `10.0.3.0/24` |

(ช่องที่ Wizard แสดง 4,096 IPs คือค่าเริ่มต้น /20 ให้แก้เป็น /24 ทั้ง 4 ช่อง ชื่อ subnet ที่ Wizard ตั้งให้อาจต่างเล็กน้อย ให้ดูที่ CIDR และ AZ เป็นหลัก)

กด Create (ได้ Internet Gateway และ Route Table ให้อัตโนมัติ)

## 3) สร้าง Security Groups (หลัก Least Privilege)

EC2 → Security Groups → Create (เลือก VPC `bu-lab-network-vpc`)

**`bu-lab-network-sg`** (Description: Lab Network)

| Type | Port | Source |
|------|------|--------|
| HTTP | 80 | 0.0.0.0/0 |
| SSH | 22 | **0.0.0.0/0 ระหว่างติดตั้ง** → เปลี่ยนเป็น **My IP** หลังติดตั้งเสร็จ (ข้อ 7.8) |

> **ทำไม SSH ต้องเป็น 0.0.0.0/0 ก่อน:** ปุ่ม Connect แบบ *EC2 Instance Connect* ในเบราว์เซอร์ (วิธีหลักในข้อ 7.1) เชื่อมต่อจากช่วง IP ของ AWS ไม่ใช่ IP ของคุณ
> ถ้าตั้ง My IP ตั้งแต่แรก จะขึ้นแถบแดง **Failed to connect to your instance** ติดตั้งเสร็จแล้วค่อยกลับมาแก้เป็น My IP

**`bu-lab-database-sg`** (Description: BU Lab Database SG — สร้างหลัง `bu-lab-network-sg`)

| Type | Port | Source |
|------|------|--------|
| MYSQL/Aurora | 3306 | **เลือก `bu-lab-network-sg`** (ไม่ใช่ IP หรือ 0.0.0.0/0) |

ผลคือ มีแต่เครื่อง EC2 ของเราที่ต่อฐานข้อมูลได้ ฐานข้อมูลไม่เปิดสู่อินเทอร์เน็ต

> **Outbound rules ของทั้งสอง SG ห้ามแก้** ต้องเป็น **All traffic → 0.0.0.0/0** (ค่าเริ่มต้น) ถ้าเหลือแค่พอร์ต 22/80 เครื่องจะออกเน็ตผ่าน https ไม่ได้ และ `curl`, `git clone` จะค้าง

## 4) สร้าง RDS MySQL (Private Subnet, Multi-AZ)

**4.1 DB Subnet Group (ทำก่อน)** RDS → Subnet groups → Create
- Name: `bu-lab-db-group`, Description: Bu Database Lab, VPC: `bu-lab-network-vpc`
- AZ: us-east-1a และ us-east-1b
- Subnets: เลือก **เฉพาะ Private Subnet 2 ตัว** (`10.0.1.0/24` และ `10.0.3.0/24`)

**4.2 Create database**

| ช่อง | ค่า |
|------|-----|
| Creation method | Standard create |
| Engine | MySQL |
| Templates | Dev/Test |
| Availability | **Multi-AZ DB instance deployment** |
| Engine version | MySQL 8.4.x (แล็บใช้ 8.4.10 ถ้าไม่มีเลือก 8.4.x ล่าสุด) |
| DB instance identifier | `bu-lab-database` |
| Credentials | Self managed, Master username `admin`, ตั้งรหัสผ่านแล้วจดไว้ |
| Instance class | `db.t3.micro` |
| Storage | 20 GiB |
| Connectivity | **Don't connect to an EC2 compute resource** |
| VPC / DB subnet group | `bu-lab-network-vpc` / `bu-lab-db-group` |
| **Public access** | **No** |
| VPC security group | `bu-lab-database-sg` (เอา default ออก) |
| Monitoring | ปิด Enhanced Monitoring |
| Additional configuration → Initial database name | `inventory_db` |
| Encryption | ไม่ติ๊ก Enable encryption |
| Backup | ไม่ติ๊ก Enable automated backup |

รอสถานะ **Available** (Multi-AZ ใช้เวลานานกว่า ราว 10–20 นาที) → จด **Endpoint** เป็น `<RDS-ENDPOINT>`

## 5) สร้าง SNS (แจ้งเตือนสินค้าใกล้หมด)

1. SNS → Topics → **Create topic** → Type: **Standard** → Name: `inventory-low-stock`
2. จด **ARN** เป็น `<SNS-ARN>`
3. Create subscription → Protocol: **Email** → ใส่อีเมลของคุณ
4. เปิดอีเมลแล้วกด **Confirm subscription** (ยังไม่กดจะไม่มีอีเมลแจ้งเตือนมา)

## 6) สร้าง EC2

EC2 → **Launch instance**

| ช่อง | ค่า |
|------|-----|
| Name | `inventory-web` |
| AMI | **Ubuntu Server 24.04 LTS** |
| Instance type | `t3.micro` |
| Key pair | `vockey` (Learner Lab ให้มา) |
| VPC | `bu-lab-network-vpc` |
| Subnet | **`bu-lab-network-subnet-public2-us-east-1b`** (10.0.30.0/24) |
| Auto-assign public IP | **Enable** |
| Firewall (security groups) | **Select existing security group** → `bu-lab-network-sg` (ห้ามเลือก Create ไม่อย่างนั้นจะขึ้น "security group already exists") |
| Storage | 8 GiB gp3 |
| **Advanced → IAM instance profile** | **`LabInstanceProfile`** |

ข้อสุดท้ายสำคัญ: โค้ดไม่เก็บ Access Key ใด ๆ แต่ใช้สิทธิ์จาก Instance Profile ถ้าไม่เลือก จะอัปโหลด S3 / ส่ง SNS ไม่ได้

เมื่อ Running จด **Public IPv4** เป็น `<EC2-PUBLIC-IP>`

## 7) ติดตั้งระบบบน EC2

**7.1 เชื่อมต่อ** (ผู้ใช้ของ Ubuntu คือ `ubuntu`)

**วิธีหลัก (ง่ายที่สุด ใช้ได้ทั้ง Windows/Mac):** EC2 → เลือกเครื่อง → **Connect** → แท็บ **EC2 Instance Connect** → Username `ubuntu` → **Connect**
จะได้หน้าจอ terminal ในเบราว์เซอร์ วางคำสั่งด้วยการคลิกขวา (ต้องตั้ง SSH เป็น 0.0.0.0/0 ตามข้อ 3)

*ทางเลือก: SSH จากเครื่องตัวเอง* (ไฟล์จาก Learner Lab → AWS Details → Download PEM)
```bash
# Mac / Linux
chmod 400 labsuser.pem
ssh -i labsuser.pem ubuntu@<EC2-PUBLIC-IP>
```
```powershell
# Windows PowerShell (chmod ใช้ไม่ได้ ใช้ icacls แทน)
icacls labsuser.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i labsuser.pem ubuntu@<EC2-PUBLIC-IP>
```

**7.2 ติดตั้งซอฟต์แวร์**
```bash
sudo apt update
sudo apt install -y nginx mysql-client unzip curl

# Node.js 22 LTS (Node 18 ที่มากับ Ubuntu หมดการสนับสนุนแล้ว)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# AWS CLI (Ubuntu AMI ไม่มีมาให้) ใช้ดึงโค้ดจาก S3
sudo snap install aws-cli --classic

node -v        # ต้องเป็น v20 ขึ้นไป
aws --version
```

**7.3 นำโค้ดขึ้นเครื่อง** (เลือกวิธีใดวิธีหนึ่ง)

*วิธีที่แนะนำ — git clone จาก GitHub (ง่ายที่สุด สำหรับกลุ่มอื่นที่ทำตามคู่มือนี้)*
```bash
sudo apt install -y git
sudo mkdir -p /opt/inventory && sudo chown ubuntu:ubuntu /opt/inventory
git clone https://github.com/tanapongzazaa-star/inventory-aws.git /opt/inventory
ls /opt/inventory        # ต้องเห็น backend database deploy docs frontend
```
ใช้วิธีนี้แล้ว ข้ามไปข้อ 7.4 ได้เลย

<details><summary>ทางเลือกอื่น (ไม่จำเป็นถ้าใช้ git clone แล้ว)</summary>

*วิธี ก — ผ่าน S3 (ไม่ต้องมีไฟล์ .pem บนเครื่องที่ใช้อัปโหลด)*
1. บนเว็บคอนโซล S3 → bucket `<BUCKET>` → อัปโหลดไฟล์ `inventory-aws.zip` ไปที่โฟลเดอร์ `deploy/`
2. บน EC2:
```bash
cd ~
aws s3 cp s3://<BUCKET>/deploy/inventory-aws.zip . --region us-east-1
```

*วิธี ข — scp จากเครื่องตัวเอง*
```bash
scp -i labsuser.pem inventory-aws.zip ubuntu@<EC2-PUBLIC-IP>:~
```

จากนั้นบน EC2:
```bash
sudo mkdir -p /opt/inventory && sudo chown ubuntu:ubuntu /opt/inventory
unzip -q ~/inventory-aws.zip -d /tmp/inv
cp -r /tmp/inv/inventory-aws/* /opt/inventory/
ls /opt/inventory        # ต้องเห็น backend database deploy docs frontend
```

</details>

**7.4 สร้างตารางในฐานข้อมูล** (ใช้ `mysql` บนเครื่อง EC2 แทน Adminer)
```bash
mysql -h <RDS-ENDPOINT> -u admin -p < /opt/inventory/database/schema.sql
mysql -h <RDS-ENDPOINT> -u admin -p -e "USE inventory_db; SHOW TABLES;"   # ต้องเห็น 4 ตาราง
```
> ตัวติดตั้ง Adminer ของแล็บ 7 ติดตั้ง Nginx + PHP ของมันเองและเปิดหน้าจัดการฐานข้อมูลสู่อินเทอร์เน็ต
> จึง**ไม่ควรรันบนเครื่องนี้** (อาจชนกับ config Nginx ของเรา) ถ้าอยากดูข้อมูลในตารางให้ใช้ `mysql` ตามข้างบน

**7.5 ตั้งค่า Backend**
```bash
cd /opt/inventory/backend
npm install --omit=dev
cp .env.example .env
openssl rand -hex 32          # คัดลอกค่าไปใส่ JWT_SECRET
nano .env                     # ใส่ DB_HOST=<RDS-ENDPOINT>, DB_PASSWORD, S3_BUCKET=<BUCKET>, SNS_TOPIC_ARN=<SNS-ARN>, JWT_SECRET
chmod 600 .env
```

**7.6 สร้างผู้ใช้ admin และทดสอบรันตรง ๆ**
```bash
npm run seed -- admin 'รหัสผ่านอย่างน้อย8ตัว' 'ผู้ดูแลระบบ'
node src/server.js &          # รันพื้นหลังชั่วคราว
curl -s http://127.0.0.1:3000/api/health      # ต้องได้ {"status":"ok","db":"up"}
kill %1
```
ถ้า `db":"down"` ดูหัวข้อแก้ปัญหา (SG/Endpoint/รหัสผ่าน)

**7.7 ให้ API รันเป็น service**
```bash
sudo cp /opt/inventory/deploy/systemd/inventory.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now inventory
systemctl status inventory --no-pager
```

**7.8 ตั้ง Nginx (เสิร์ฟหน้าเว็บ + Reverse Proxy)** — Ubuntu ใช้โฟลเดอร์ `sites-available` / `sites-enabled`
```bash
sudo mkdir -p /var/www/inventory
sudo cp -r /opt/inventory/frontend/* /var/www/inventory/
sudo cp /opt/inventory/deploy/nginx/inventory.conf /etc/nginx/sites-available/inventory
sudo ln -sf /etc/nginx/sites-available/inventory /etc/nginx/sites-enabled/inventory
sudo rm -f /etc/nginx/sites-enabled/default     # ต้องลบ ไม่งั้นชนกับ default_server ของเรา
sudo nginx -t                                   # ต้องขึ้น syntax is ok
sudo systemctl enable nginx
sudo systemctl restart nginx
```

**ติดตั้งเสร็จแล้ว:** กลับไปที่ `bu-lab-network-sg` → Edit inbound rules → เปลี่ยน SSH 22 เป็น **My IP** แล้ว Save rules

## 8) ทดสอบ

เปิด `http://<EC2-PUBLIC-IP>/` แล้วเข้าสู่ระบบด้วย admin

- [ ] Dashboard ขึ้นตัวเลข (เริ่มต้นเป็น 0)
- [ ] เพิ่มสินค้า 1 รายการพร้อมรูป → รูปแสดงในตาราง (แปลว่าอัปโหลด S3 ผ่าน)
- [ ] ตรวจใน S3 ว่ามีไฟล์ใน `products/`
- [ ] ตั้ง Min stock = 5, จำนวนเริ่มต้น = 6 แล้วตัดจ่าย 2 → **อีเมล SNS มาถึง** (ส่งตอนยอดข้ามจุดสั่งซื้อลงมา)
- [ ] ตัดจ่ายเกินยอดคงเหลือ → ขึ้นข้อความ "สต็อกไม่พอ"
- [ ] หน้า "ประวัติรายการ" เห็นรายการครบ พร้อมชื่อผู้ทำรายการ
- [ ] ปุ่ม "ส่งออกรายงานสต็อก" ดาวน์โหลด CSV ได้ และมีไฟล์ใน `reports/` ของ S3
- [ ] ลองเข้าฐานข้อมูลจากเครื่องตัวเอง/อินเทอร์เน็ตโดยตรง → ต้อง**ต่อไม่ได้** (หลักฐานว่า Private Subnet ทำงาน ใช้ในเดโมได้)
- [ ] (ไม่บังคับ) RDS → Actions → *Reboot with failover* แล้วดูว่าแอปกลับมาใช้ได้ภายใน 1–2 นาที

### หลักฐานที่ส่งกลับให้ทีมเจ้าของโปรเจกต์ (Peer verification)

แคปหน้าจอ 6 ภาพนี้ แล้วแนบใน Submit X ตอนรายงานผลการทดสอบ

1. เบราว์เซอร์เปิด `http://<EC2-PUBLIC-IP>/api/health` ขึ้น `{"status":"ok","db":"up"}`
2. หน้า Dashboard หลังเพิ่มสินค้าที่มีรูปแล้ว
3. S3 bucket โฟลเดอร์ `products/` มีไฟล์รูป และโฟลเดอร์ `reports/` มีไฟล์ CSV
4. อีเมลแจ้งเตือนสินค้าใกล้หมดจาก SNS (ปิดที่อยู่อีเมลส่วนตัวได้)
5. ข้อความ "สต็อกไม่พอ" ตอนตัดจ่ายเกินยอด
6. RDS → Configuration ขึ้น **Multi-AZ: Yes** และ **Publicly accessible: No**

ถ้าติดขั้นไหน ให้จดเลขข้อและข้อความ error ไว้ แล้วดูตาราง "แก้ปัญหาที่เจอบ่อย" ท้ายคู่มือ

## 9) คุมงบและการปิดระบบ

| ทรัพยากร | แนวทาง |
|----------|--------|
| EC2 | **Stop** เมื่อไม่ใช้ (ไม่คิดค่า compute แต่ยังคิดค่า disk เล็กน้อย) Public IP เปลี่ยนทุกครั้งที่ Start ใหม่ ให้ตรวจ IP ใหม่ทุกครั้ง |
| RDS | Multi-AZ คิดเงินราวสองเท่าของ Single-AZ ตลอดที่เปิดอยู่ ตรวจว่า **Stop temporarily** ได้หรือไม่เมื่อไม่ใช้ (ถ้าหยุดไว้ AWS จะเปิดกลับเองเมื่อครบ 7 วัน) |
| NAT Gateway | ไม่สร้าง ถ้าสร้างเพื่อโชว์ให้ลบทันทีหลังเดโม และลบ Elastic IP ด้วย |
| S3 / SNS | ค่าใช้จ่ายน้อยมากในขนาดโปรเจกต์นี้ |

**ลบทรัพยากรเมื่อทดสอบเสร็จ (ลำดับเดียวกับแล็บ 7):** Terminate EC2 → Delete RDS (ติ๊กไม่ทำ final snapshot) → Delete DB subnet group → (ถ้ามี) ลบ NAT Gateway และ Elastic IP → ลบ VPC → Empty แล้วลบ S3 bucket → ลบ SNS topic → Sign out และ End Lab

เช็กยอดเครดิตที่แถบ Budget ของ Learner Lab ทุกครั้งที่เริ่มและหยุดทำงาน

---

## แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุที่น่าจะเป็น | วิธีแก้ |
|-------|--------------------|---------|
| `Permission denied (publickey)` / `UNPROTECTED PRIVATE KEY` ตอน SSH | ใช้ชื่อผู้ใช้ผิด หรือสิทธิ์ไฟล์ .pem | ใช้ `ubuntu@...` · Mac/Linux `chmod 400` · Windows ใช้ `icacls` ตามข้อ 7.1 หรือใช้ปุ่ม Connect ในเบราว์เซอร์แทน |
| กด Connect ในเบราว์เซอร์แล้ว Failed to connect | SSH เปิดแค่ My IP | ตั้ง SSH 22 เป็น 0.0.0.0/0 ระหว่างติดตั้ง (ดูหัวข้อ 3) |
| `aws: command not found` | ยังไม่ติดตั้ง AWS CLI | `sudo snap install aws-cli --classic` |
| เปิดเว็บแล้วเจอหน้า "Welcome to nginx" | ยังไม่ได้ลบ default site | `sudo rm -f /etc/nginx/sites-enabled/default` แล้ว `sudo systemctl restart nginx` |
| เปิดเว็บแล้ว **502 Bad Gateway** | API ไม่ได้รัน | `journalctl -u inventory -n 50 --no-pager` ดูข้อความ error |
| Log ขึ้น `Missing required env: ...` | ใน `.env` ขาดค่า | แก้ `.env` แล้ว `sudo systemctl restart inventory` |
| `/api/health` ได้ `db: down` / `ETIMEDOUT` | `bu-lab-database-sg` ไม่ได้อนุญาต `bu-lab-network-sg` หรือ Endpoint ผิด | ตรวจ Inbound ของ `bu-lab-database-sg` และ `DB_HOST` |
| `ER_ACCESS_DENIED_ERROR` | รหัสผ่าน/ผู้ใช้ DB ผิด | แก้ `DB_USER`/`DB_PASSWORD` ใน `.env` |
| อัปโหลดรูปแล้ว `AccessDenied` | ลืมใส่ `LabInstanceProfile` ให้ EC2 | EC2 → Actions → Security → Modify IAM role → เลือก `LabInstanceProfile` |
| ไม่มีอีเมลแจ้งเตือน | ยังไม่กด Confirm subscription / `SNS_TOPIC_ARN` ว่าง / ยอดไม่ได้ข้ามจุด Min stock | ตรวจตามนี้ แล้วดู `journalctl` หา `SNS publish failed` |
| อัปโหลดรูปได้ `413` | ไฟล์เกินขนาด | `client_max_body_size` ใน Nginx ตั้งไว้ 6m, แอปจำกัด 5MB |
| เปลี่ยนโค้ดหน้าเว็บแล้วไม่อัปเดต | แคชเบราว์เซอร์ / ยังไม่ได้คัดลอกไป `/var/www/inventory` | คัดลอกใหม่ แล้วกด Ctrl+Shift+R |
