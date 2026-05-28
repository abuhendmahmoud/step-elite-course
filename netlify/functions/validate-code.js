// netlify/functions/validate-code.js
// Called from the course HTML — verifies email + code pair

const crypto = require('crypto');

const SALT = process.env.STEP_SALT || 'ABH_STEP_MAHMOUD_2026';

function generateCode(email) {
  return crypto
    .createHash('sha256')
    .update(SALT + email.toLowerCase().trim())
    .digest('hex')
    .substring(0, 6)
    .toUpperCase();
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ valid: false }) };
  }

  try {
    const { email, code } = JSON.parse(event.body || '{}');

    if (!email || !code) {
      return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Missing email or code' }) };
    }

    const expected = generateCode(email);
    const valid = code.trim().toUpperCase() === expected;

    console.log(`Validation: ${email} → entered: ${code.toUpperCase()} | expected: ${expected} | valid: ${valid}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ valid })
    };
  } catch (err) {
    console.error('Validation error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ valid: false, error: 'Server error' }) };
  }
};
