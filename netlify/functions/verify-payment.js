// netlify/functions/verify-payment.js

const crypto = require('crypto');

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

function verifyHmac(obj, hmacSecret) {
  const fields = [
    'amount_cents','created_at','currency','error_occured','has_parent_transaction',
    'id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded',
    'is_standalone_payment','is_voided','order.id','owner','pending',
    'source_data.pan','source_data.sub_type','source_data.type','success',
  ];
  const concatenated = fields.map((f) => {
    const parts = f.split('.');
    let val = obj;
    for (const p of parts) val = val?.[p];
    return val === undefined || val === null ? '' : String(val);
  }).join('');
  const calculated = crypto.createHmac('sha512', hmacSecret).update(concatenated).digest('hex');
  return calculated === obj.hmac;
}

function sendEmail({ to, studentName, unlockCode, deviceCode, amountEGP }) {
  return new Promise((resolve, reject) => {
    let nodemailer;
    try { nodemailer = require('nodemailer'); }
    catch { return reject(new Error('nodemailer missing')); }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    });

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Tahoma,sans-serif;background:#f4f7fb;padding:40px 0;">'
      + '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">'
      + '<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;">'
      + '<h1 style="margin:0;color:#fff;font-size:26px;">STEP Elite Course</h1>'
      + '<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Saudi Standardized Test of English Proficiency</p></div>'
      + '<div style="padding:36px 40px;">'
      + '<p style="font-size:16px;color:#1e293b;">Dear <strong>' + studentName + '</strong>,</p>'
      + '<p style="font-size:15px;color:#475569;line-height:1.6;">Your payment of <strong>' + amountEGP + ' EGP</strong> has been received. Your unlock code is below — it works only on the device with code <code>' + deviceCode + '</code>.</p>'
      + '<div style="background:#f0f4ff;border:2px dashed #6366f1;border-radius:10px;padding:24px;text-align:center;margin:24px 0;">'
      + '<p style="margin:0 0 8px;font-size:13px;color:#6366f1;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your Unlock Code</p>'
      + '<span style="font-family:monospace;font-size:40px;font-weight:800;color:#4f46e5;letter-spacing:8px;">' + unlockCode + '</span></div>'
      + '<h3 style="font-size:15px;color:#1e293b;">How to use:</h3>'
      + '<ol style="color:#475569;font-size:14px;line-height:1.8;">'
      + '<li>Open the STEP course file on the <strong>same device</strong>.</li>'
      + '<li>Click <strong>"I Have a Code"</strong> on the overview page.</li>'
      + '<li>Enter Device Code: <code>' + deviceCode + '</code></li>'
      + '<li>Enter Unlock Code: <code>' + unlockCode + '</code></li>'
      + '<li>Click <strong>Unlock</strong> — all 11 sessions open instantly!</li></ol>'
      + '<div style="background:#f0fdf4;border-right:4px solid #22c55e;padding:14px;border-radius:8px;margin:20px 0;direction:rtl;">'
      + '<p style="margin:0;font-size:13px;color:#166534;">مبروك! كودك: <strong style="font-family:monospace;letter-spacing:3px;">' + unlockCode + '</strong> — استخدمه على نفس الجهاز. بالتوفيق!</p></div>'
      + '<p style="font-size:13px;color:#94a3b8;text-align:center;">Questions? <a href="mailto:abuhendmahmoud@gmail.com" style="color:#6366f1;">abuhendmahmoud@gmail.com</a></p>'
      + '</div><div style="background:#f8fafc;padding:16px 40px;text-align:center;border-top:1px solid #e2e8f0;">'
      + '<p style="margin:0;font-size:12px;color:#94a3b8;">STEP Elite Course | Sent automatically after payment.</p></div></div></body></html>';

    transporter.sendMail({
      from: '"STEP Elite Course" <' + process.env.GMAIL_USER + '>',
      to, subject: 'Your STEP Elite Course Unlock Code', html,
    }, (err, info) => {
      if (err) { console.error('Email error:', err); reject(err); }
      else { console.log('Email sent:', info.messageId); resolve(info); }
    });
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let obj;
  try { obj = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;
  if (!HMAC_SECRET) return { statusCode: 500, body: 'Server misconfiguration' };

  if (!verifyHmac(obj, HMAC_SECRET)) {
    console.error('HMAC mismatch');
    return { statusCode: 401, body: 'HMAC verification failed' };
  }

  if (obj.success !== true && obj.success !== 'true') {
    return { statusCode: 200, body: 'Ignored' };
  }

  const extras    = obj.order?.merchant_order_id || '';
  const refMatch  = extras.match(/^STEP-([0-9A-Fa-f]{8})-\d+$/);
  const deviceCode = refMatch ? refMatch[1].toUpperCase() : null;

  const studentEmail = obj.order?.billing_data?.email || obj.billing_data?.email || null;
  const studentName  = [obj.order?.billing_data?.first_name, obj.order?.billing_data?.last_name].filter(Boolean).join(' ') || 'Student';
  const amountEGP    = ((parseInt(obj.amount_cents || '0', 10)) / 100).toFixed(2);

  if (!deviceCode) { console.error('No device code in:', extras); return { statusCode: 200, body: 'No device code' }; }
  if (!studentEmail) { console.error('No email found'); return { statusCode: 200, body: 'No email' }; }

  const unlockCode = generateUnlockCode(deviceCode);
  console.log('Verified | Device:', deviceCode, '| Code:', unlockCode, '| Email:', studentEmail);

  try { await sendEmail({ to: studentEmail, studentName, unlockCode, deviceCode, amountEGP }); }
  catch (err) { console.error('Email failed:', err.message); }

  return { statusCode: 200, body: 'OK' };
};
