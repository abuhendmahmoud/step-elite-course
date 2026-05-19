// netlify/functions/verify-payment.js
// Receives Paymob webhook → verifies HMAC → generates unlock code → emails student

const crypto = require('crypto');
const { Resend } = require('resend');

const SALT = 'ABH_STEP_MAHMOUD_2026';

function generateUnlockCode(deviceCode) {
  const str = deviceCode.toUpperCase() + SALT;
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h, 33) ^ str.charCodeAt(i);
  }
  h = Math.abs(h);
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = ''; let n = h;
  for (let i = 0; i < 6; i++) { c += ch[n % ch.length]; n = Math.floor(n / ch.length); }
  return c;
}

function verifyHmac(txn, topLevelHmac, hmacSecret) {
  const fields = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction',
    'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
    'is_standalone_payment','is_voided','order.id','owner','pending',
    'source_data.pan','source_data.sub_type','source_data.type','success',
  ];
  const concatenated = fields.map((f) => {
    const parts = f.split('.');
    let val = txn;
    for (const p of parts) val = val?.[p];
    return val === undefined || val === null ? '' : String(val);
  }).join('');
  const calculated = crypto.createHmac('sha512', hmacSecret).update(concatenated).digest('hex');
  return calculated === topLevelHmac;
}

async function sendEmail({ to, studentName, unlockCode, deviceCode, amountEGP }) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: 'STEP Elite Course <onboarding@resend.dev>',
    to,
    subject: 'Your STEP Elite Course Unlock Code',
    html: '<!DOCTYPE html><html dir="ltr"><head><meta charset="UTF-8"></head>' +
      '<body style="margin:0;padding:0;background:#f4f7fb;font-family:Tahoma,sans-serif;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 0;"><tr><td align="center">' +
      '<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">' +
      '<tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;">' +
      '<h1 style="margin:0;color:#fff;font-size:26px;">STEP Elite Course</h1>' +
      '<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Saudi Standardized Test of English Proficiency</p>' +
      '</td></tr>' +
      '<tr><td style="padding:36px 40px;">' +
      '<p style="font-size:16px;color:#1e293b;">Dear <strong>' + studentName + '</strong>,</p>' +
      '<p style="font-size:15px;color:#475569;line-height:1.6;">Your payment of <strong>' + amountEGP + ' EGP</strong> has been received. ' +
      'Your unlock code for Device Code <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">' + deviceCode + '</code> is below.</p>' +
      '<div style="background:#f0f4ff;border:2px dashed #6366f1;border-radius:10px;padding:24px;text-align:center;margin:24px 0;">' +
      '<p style="margin:0 0 8px;font-size:13px;color:#6366f1;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your Unlock Code</p>' +
      '<span style="font-family:monospace;font-size:36px;font-weight:800;color:#4f46e5;letter-spacing:6px;">' + unlockCode + '</span></div>' +
      '<h3 style="font-size:15px;color:#1e293b;">How to use:</h3>' +
      '<ol style="color:#475569;font-size:14px;line-height:1.8;">' +
      '<li>Open the STEP course file on the <strong>same device</strong>.</li>' +
      '<li>Click <strong>"I Have a Code"</strong> on the overview page.</li>' +
      '<li>Enter Device Code: <code>' + deviceCode + '</code></li>' +
      '<li>Enter Unlock Code: <code>' + unlockCode + '</code></li>' +
      '<li>Click <strong>Unlock</strong> — all 11 sessions open instantly!</li></ol>' +
      '<div style="background:#fef9c3;border-left:4px solid #f59e0b;padding:14px 16px;margin-bottom:20px;">' +
      '<p style="margin:0;font-size:13px;color:#92400e;"><strong>Important:</strong> This code only works on this device. ' +
      'Need a transfer? Email <a href="mailto:abuhendmahmoud@gmail.com" style="color:#92400e;">abuhendmahmoud@gmail.com</a></p></div>' +
      '<div dir="rtl" style="background:#f0fdf4;border-right:4px solid #22c55e;padding:14px 16px;border-radius:8px 0 0 8px;margin-bottom:24px;">' +
      '<p style="margin:0;font-size:13px;color:#166534;line-height:1.8;"><strong>مبروك!</strong> تم استلام دفعتك. كودك: ' +
      '<strong style="letter-spacing:3px;font-family:monospace;">' + unlockCode + '</strong>. بالتوفيق في STEP!</p></div>' +
      '<p style="font-size:14px;color:#94a3b8;text-align:center;">Good luck! 🚀<br>' +
      '<a href="mailto:abuhendmahmoud@gmail.com" style="color:#6366f1;">abuhendmahmoud@gmail.com</a></p>' +
      '</td></tr>' +
      '<tr><td style="background:#f8fafc;padding:16px 40px;text-align:center;border-top:1px solid #e2e8f0;">' +
      '<p style="margin:0;font-size:12px;color:#94a3b8;">STEP Elite Course | Sent automatically after payment.</p>' +
      '</td></tr></table></td></tr></table></body></html>',
  });

  if (error) throw new Error(JSON.stringify(error));
  console.log('Email sent via Resend:', data?.id);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const txn  = body.obj || body;
  const hmac = event.queryStringParameters?.hmac || body.hmac || txn.hmac;

  const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;
  if (!HMAC_SECRET) return { statusCode: 500, body: 'Server misconfiguration' };

  console.log('Webhook received | hmac:', hmac ? 'present' : 'MISSING', '| type:', body.type);

  const hmacValid = verifyHmac(txn, hmac, HMAC_SECRET);
  if (!hmacValid) {
    console.error('HMAC mismatch. Received:', hmac);
    return { statusCode: 401, body: 'HMAC verification failed' };
  }

  if (txn.success !== true && txn.success !== 'true') {
    console.log('Not successful, ignoring. success=', txn.success);
    return { statusCode: 200, body: 'Ignored' };
  }

  const shipping    = txn.order?.shipping_data || {};
  const billingData = txn.order?.billing_data  || txn.billing_data || {};

  let deviceCode = null;
  if (shipping.building && /^[0-9A-Fa-f]{8}$/.test(shipping.building)) {
    deviceCode = shipping.building.toUpperCase();
  }
  if (!deviceCode) {
    const ref = txn.order?.merchant_order_id || '';
    const m   = ref.match(/^STEP-([0-9A-Fa-f]{8})-\d+$/);
    if (m) deviceCode = m[1].toUpperCase();
  }

  const studentEmail = shipping.email || billingData.email || txn.extra?.student_email || null;
  const studentName  = [shipping.first_name || billingData.first_name, shipping.last_name || billingData.last_name].filter(Boolean).join(' ') || 'Student';
  const amountEGP    = ((parseInt(txn.amount_cents || '0', 10)) / 100).toFixed(2);

  console.log('Extracted | deviceCode:', deviceCode, '| email:', studentEmail, '| amount:', amountEGP);

  if (!deviceCode) return { statusCode: 200, body: 'No device code – manual processing needed' };
  if (!studentEmail) return { statusCode: 200, body: 'No email – manual processing needed' };

  const unlockCode = generateUnlockCode(deviceCode);
  console.log('Sending code:', unlockCode, 'to', studentEmail);

  try {
    await sendEmail({ to: studentEmail, studentName, unlockCode, deviceCode, amountEGP });
  } catch (err) {
    console.error('Failed to send email:', err.message);
  }

  return { statusCode: 200, body: 'OK' };
};
