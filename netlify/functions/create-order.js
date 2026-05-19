// netlify/functions/create-order.js

const https = require('https');

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
        ...(token ? { Authorization: 'Token ' + token } : {}),
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
    return respond(400, { error: 'Missing required fields' });
  }
  if (!/^[0-9A-Fa-f]{8}$/.test(deviceCode)) {
    return respond(400, { error: 'Invalid device code format (expected 8 hex characters)' });
  }

  const SECRET_KEY   = process.env.PAYMOB_SECRET_KEY;
  const PUBLIC_KEY   = process.env.PAYMOB_PUBLIC_KEY;
  const AMOUNT_CENTS = parseInt(process.env.COURSE_PRICE_CENTS || '70000', 10);
  const SITE_URL     = process.env.URL || 'https://sunny-druid-4025ad.netlify.app';

  if (!SECRET_KEY || !PUBLIC_KEY) {
    console.error('Missing env vars');
    return respond(500, { error: 'Payment gateway not configured' });
  }

  const merchantReference = 'STEP-' + deviceCode.toUpperCase() + '-' + Date.now();

  const intentionBody = {
    amount: AMOUNT_CENTS,
    currency: 'EGP',
    payment_methods: [5676435, 5676429],
    items: [{
      name: 'STEP Elite Course',
      amount: AMOUNT_CENTS,
      description: 'Saudi STEP Exam Prep – All 11 Sessions',
      quantity: 1,
    }],
    billing_data: {
      first_name: name.split(' ')[0] || name,
      last_name:  name.split(' ').slice(1).join(' ') || 'Student',
      email,
      phone_number: phone,
      country: 'EG',
      city: 'Cairo',
      street: 'N/A',
      building: deviceCode.toUpperCase(),
      floor: 'N/A',
      apartment: 'N/A',
    },
    customer: {
      first_name: name.split(' ')[0] || name,
      last_name:  name.split(' ').slice(1).join(' ') || 'Student',
      email,
    },
    merchant_order_id: merchantReference,
    redirection_url: SITE_URL + '/payment-success.html',
    notification_url: SITE_URL + '/.netlify/functions/verify-payment',
  };

  let intentionRes;
  try {
    intentionRes = await postJSON('accept.paymob.com', '/v1/intention/', intentionBody, SECRET_KEY);
  } catch (err) {
    console.error('Network error:', err);
    return respond(502, { error: 'Failed to reach payment gateway' });
  }

  console.log('Paymob status:', intentionRes.status);

  if (intentionRes.status !== 201 && intentionRes.status !== 200) {
    console.error('Paymob error:', intentionRes.body);
    return respond(502, { error: 'Payment gateway error', detail: intentionRes.body });
  }

  const clientSecret = intentionRes.body.client_secret;
  if (!clientSecret) {
    return respond(502, { error: 'Invalid payment gateway response' });
  }

  const checkoutUrl = 'https://accept.paymob.com/unifiedcheckout/?publicKey=' + PUBLIC_KEY + '&clientSecret=' + clientSecret;
  return respond(200, { checkoutUrl, merchantReference });
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
