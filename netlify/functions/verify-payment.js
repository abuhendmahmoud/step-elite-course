const crypto = require('crypto');
const https  = require('https');

const SALT = 'ABH_STEP_MAHMOUD_2026';

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

function generateUnlockCode(deviceCode) {
  return djb2(deviceCode.toUpperCase() + SALT)
    .toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
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

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f7fb;padding:40px 0">
<table width="560" align="center" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)">
<tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center">
<h1 style="margin:0;color:#fff;font-size:26px">🎓 STEP Elite Course</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:14px">Saudi Standardized Test of English Proficiency</p>
</td></tr>
<tr><td style="padding:36px 40px">
<p style="font-size:16px;color:#1e293b">Dear <strong>${studentName}</strong>,</p>
<p style="font-size:15px;color:#475569;line-height:1.6">Your payment of <strong>${amountEGP} EGP</strong> has been received. Your unlock code is below —
