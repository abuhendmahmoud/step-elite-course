// netlify/functions/create-order.js
// Creates a Paymob Payment Intention and returns the checkout URL
// Called by the HTML payment panel when student clicks "Pay Now"

const https = require('https');

// ── helpers ────────────────────────────────────────────────────────────────
function postJSON(hostname, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Token ${token}` } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── main handler ───────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return respond(400, { error: 'Invalid JSON body' }); }

  const { name, email, phone, deviceCode } = payload;

  if (!name || !email || !phone || !deviceCode) {
    return respond(400, { error: 'Missing required fields: name, email, phone, deviceCode' });
  }
  if (!/^[0-9A-Fa-f]{8}$/.test(deviceCode)) {
    return respond(400, { error: 'Invalid device code format (expected 8 hex characters)' });
  }

  const SECRET_KEY     = process.env.PAYMOB_SECRET_KEY;
  const PUBLIC_KEY     = process.env.PAYMOB_PUBLIC_KEY;
  const INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID || '5676435';
  const AMOUNT_CENTS   = parseInt(process.env.COURSE_PRICE_CENTS || '70000', 10);
  const SITE_URL       = process.env.URL || 'https://step-with-mahmoud.netlify.app';

  if (!SECRET_KEY || !PUBLIC_KEY) {
    return respond(500, { error: 'Payment gateway not configured' });
  }

  const merchantReference = `STEP-${deviceCode.toUpperCase()}-${Date.now()}`;

  const intentionBody = {
    amount: AMOUNT_CENTS,
    currency: 'EGP',
    payment_methods: [parseInt(INTEGRATION_ID, 10)],
    items: [{ name: 'STEP Elite Course – Full Access', amount: AMOUNT_CENTS, description: 'Saudi STEP Exam Prep – All 11 Sessions', quantity: 1 }],
    billing_data: {
      first_name: name.split(' ')[0] || name,
      last_name: name.split(' ').slice(1).join(' ') || 'Student',
      email, phone_number: phone, country: 'EG', city: 'Cairo',
      street: 'N/A', building: 'N/A', floor: 'N/A', apartment: 'N/A',
    },
    customer: { first_name: name.split(' ')[0] || name, last_name: name.split(' ').slice(1).join(' ') || 'Student', email },
    extras: { device_code: deviceCode.toUpperCase(), student_email: email, student_name: name },
    merchant_order_id: merchantReference,
    redirection_url: `${SITE_URL}/payment-success.html`,
    notification_url: `${SITE_URL}/.netlify/functions/verify-payment`,
  };

  let intentionRes;
  try {
    intentionRes = await postJSON('accept.paymob.com', '/v1/intention/', intentionBody, SECRET_KEY);
  } catch (err) {
    return respond(502, { error: 'Failed to reach payment gateway' });
  }

  if (intentionRes.status !== 201 && intentionRes.status !== 200) {
    return respond(502, { error: 'Payment gateway error', detail: intentionRes.body });
  }

  const clientSecret = intentionRes.body.client_secret;
  if (!clientSecret) {
    return respond(502, { error: 'Invalid payment gateway response' });
  }

  const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${PUBLIC_KEY}&clientSecret=${clientSecret}`;
  return respond(200, { checkoutUrl, merchantReference, amountEGP: (AMOUNT_CENTS / 100).toFixed(2) });
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function respond(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...corsHeaders() }, body: JSON.stringify(body) };
}
