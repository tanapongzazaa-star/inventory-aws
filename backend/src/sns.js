const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const client = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * ส่งอีเมลแจ้งเตือนสินค้าใกล้หมดผ่าน Amazon SNS
 * - ถ้าไม่ได้ตั้ง SNS_TOPIC_ARN จะข้ามเงียบ ๆ
 * - Subject ของ SNS ต้องเป็น ASCII เท่านั้น ส่วนเนื้อหา (Message) ใช้ภาษาไทยได้
 */
async function notifyLowStock(product) {
  const topicArn = process.env.SNS_TOPIC_ARN;
  if (!topicArn) return;

  await client.send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: `[Inventory] Low stock: ${product.sku}`.slice(0, 100),
      Message: [
        'แจ้งเตือนสินค้าใกล้หมด',
        `สินค้า: ${product.name} (${product.sku})`,
        `คงเหลือ: ${product.quantity}`,
        `จุดสั่งซื้อ (min stock): ${product.min_stock}`,
      ].join('\n'),
    })
  );
}

module.exports = { notifyLowStock };
