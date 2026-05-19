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

function sendEmail({ to, studentName, unlockCode, deviceCode, amountEGP }) {
  return new Promise((resolve, reject) => {
    let nodemailer;
    try { nodemailer = require('nodemailer'); }
    catch { return reject(new Error('nodemailer missing')); }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    });

    const html = '<div style="font-family:Tahoma,sans-serif;max-width:560px;margin:0 auto;">'
      + '<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;text-align:center;">'
      + '<h1 style="margin:0;color:#fff;">STEP Elite Course</h1></div>'
      + '<div style="padding:36px;background:#fff;">'
      + '<p>Dear <strong>' + studentName + '</strong>,</p>'
      + '<p>Your payment of <strong>' + amountEGP + ' EGP</strong> was received. Here is your unlock code:</p>'
      + '<div style="background:#f0f4ff;border:2px dashed #6366f1;border-radius:10px;padding:24px;text-align:center;margin:24px 0;">'
      + '<p style="margin:0 0 8px;color:#6366f1;font-weight:600;text-transform:uppercase;">Your Unlock Code</p>'
      + '<span style="font-family:monospace;font-size:40px;font-weight:800;color:#4f46e5;letter-spacing:8px;">' + unlockCode + '</span></div>'
      + '<p>Device Code: <code>' + deviceCode + '</code></p>'
      + '<p>Open the course file on the same device → click "I Have a Code" → enter both codes → Unlock!</p>'
      + '<p style="direction:rtl;background:#f0fdf4;padding:12px;border-radius:8px;">مبروك! كودك: <strong>' + unlockCode + '</strong> — استخدمه على نفس الجهاز.</p>'
      + '<p style="color:#94a3b8;font-size:13px;">Questions? <a href="mailto:abuhendmahmoud@gmail.com">abuhendmahmoud@gmail.com</a></p>'
      + '</div></div>';

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

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const txn = body.obj || body;

  console.log('Webhook type:', body.type);
  console.log('success:', txn.success);

  if (txn.success !== true && txn.success !== 'true') {
    console.log('Not successful, ignoring.');
    return { statusCode: 200, body: 'Ignored' };
  }

  const shipping    = txn.order?.shipping_data || {};
  const deviceCode  = shipping.building && /^[0-9A-Fa-f]{8}$/.test(shipping.building)
                      ? shipping.building.toUpperCase() : null;
  const studentEmail = shipping.email || null;
  const studentName  = [shipping.first_name, shipping.last_name].filter(Boolean).join(' ') || 'Student';
  const amountEGP    = ((parseInt(txn.amount_cents || '0', 10)) / 100).toFixed(2);

  console.log('deviceCode:', deviceCode, '| email:', studentEmail);

  if (!deviceCode) { console.error('No device code in shipping_data.building'); return { statusCode: 200, body: 'No device code' }; }
  if (!studentEmail) { console.error('No email in shipping_data'); return { statusCode: 200, body: 'No email' }; }

  const unlockCode = generateUnlockCode(deviceCode);
  console.log('Sending code:', unlockCode, 'to:', studentEmail);

  try { await sendEmail({ to: studentEmail, studentName, unlockCode, deviceCode, amountEGP }); }
  catch (err) { console.error('Email failed:', err.message); }

  return { statusCode: 200, body: 'OK' };
};
