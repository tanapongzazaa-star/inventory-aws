const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ไม่ใส่ credentials: SDK จะดึงจาก Instance Profile ของ EC2 เอง
const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const bucket = () => process.env.S3_BUCKET;

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** อัปโหลดรูปสินค้า (multer file) -> คืน object key */
async function uploadImage(file) {
  const key = `products/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${EXT[file.mimetype]}`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );
  return key;
}

/** อัปโหลดไฟล์ทั่วไป (เช่น รายงาน CSV) */
async function uploadRaw(key, body, contentType) {
  await client.send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType })
  );
  return key;
}

async function remove(key) {
  if (!key) return;
  await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** ลิงก์ชั่วคราวสำหรับดู/ดาวน์โหลด (bucket เป็น private) */
async function signedUrl(key, expiresIn = 3600, downloadName) {
  const params = { Bucket: bucket(), Key: key };
  if (downloadName) {
    params.ResponseContentDisposition = `attachment; filename="${downloadName}"`;
  }
  return getSignedUrl(client, new GetObjectCommand(params), { expiresIn });
}

module.exports = { uploadImage, uploadRaw, remove, signedUrl };
