// netlify/functions/verify-payment.js
// Receives Paymob webhook → verifies HMAC → generates unlock code → emails student

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
    .toString(16)
    .toUpperCase()
    .padStart(8, '0')
    .slice(0, 8);
}

function verifyHmac(obj, hmacSecret) {
  const fields = [
    'amount_cents',
    'created_at',
    'currency',
    'error_occured',
    'has_parent_transaction',
    'id',
    'integration_id',
    'is_3d_secure',
    'is_auth',
    'is_capture',
    'is_refunded',
    'is_standalone_payment',
    'is_voided',
    'order.id',
    'owner',
    'pending',
    'source_data.pan',
    'source_data.sub_type',
    'source_data.type',
    'success',
  ];

  const concatenated = fields
    .map((f) => {
      const parts = f.split('.');
      let val = obj;
      for (const p of parts) val = val?.[p];
      return val === undefined || val === null ? '' : String(val);
    })
    .join('');

  const calculated = crypto
    .createHmac('sha512', hmacSecret)
    .update(concatenated)
    .digest('hex');

  return calculated === obj.hmac;
}

function sendEmail({ to, studentName, unlockCode, deviceCode, amountEGP }) {
  return new Promise((resolve, reject) => {
    let nodemailer;
    try { nodemailer = require('nodemailer'); }
    catch {
      console.error('nodemailer not installed');
      return reject(new Error('nodemailer missing'));
    }

    const transporter = nodemailer.
