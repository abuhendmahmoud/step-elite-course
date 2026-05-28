// netlify/functions/gumroad-webhook.js
// Receives Gumroad sale webhook → generates code from email → emails student automatically

const crypto = require('crypto');
const { Resend } = require('resend');

const SALT = process.env.STEP_SALT || 'ABH_STEP_MAHMOUD_2026';
const COURSE_URL = 'https://abuhendmahmoud.github.io/step-elite-course/STEP_Full_Course.html';

function generateCode(email) {
  return crypto
    .createHash('sha256')
    .update(SALT + email.toLowerCase().trim())
    .digest('hex')
    .substring(0, 6)
    .toUpperCase();
}

async function sendCodeEmail(toEmail, code) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: 'STEP Elite Course <onboarding@resend.dev>',
    to: toEmail,
    subject: '🎓 كود تفعيل كورس STEP Elite الخاص بك',
    html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:Tahoma,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:16px;overflow:hidden;border:1px solid #2d3148;">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#1a1d2e,#2d3148);padding:32px;text-align:center;border-bottom:2px solid #f0c040;">
        <h1 style="margin:0;color:#f0c040;font-size:1.8rem;">🎓 STEP Elite Course</h1>
        <p style="margin:8px 0 0;color:#94a3b8;font-size:0.95rem;">شكراً لاشتراكك — الكورس الكامل في انتظارك</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px;">
        <p style="color:#e2e8f0;font-size:1rem;line-height:1.7;">السلام عليكم،</p>
        <p style="color:#e2e8f0;font-size:1rem;line-height:1.7;">
          تم استلام دفعتك بنجاح! 🎉<br>
          تفضل كود التفعيل الخاص بك — مخصص لبريدك الإلكتروني:
        </p>
        <!-- Code Box -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:24px 0;">
            <div style="display:inline-block;background:#0f1117;border:2px solid #22c55e;border-radius:12px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px;color:#94a3b8;font-size:0.85rem;">كود التفعيل</p>
              <div style="font-size:2.4rem;font-weight:900;letter-spacing:10px;color:#22c55e;font-family:monospace;">${code}</div>
            </div>
          </td></tr>
        </table>
        <!-- Steps -->
        <p style="color:#e2e8f0;font-size:1rem;margin-bottom:8px;"><b>خطوات تفعيل الكورس:</b></p>
        <table width="100%" cellpadding="8" cellspacing="0">
          <tr><td style="color:#e2e8f0;font-size:0.95rem;line-height:1.8;">
            <b style="color:#f0c040;">1.</b> افتح رابط الكورس:<br>
            <a href="${COURSE_URL}" style="color:#f0c040;word-break:break-all;">${COURSE_URL}</a>
          </td></tr>
          <tr><td style="color:#e2e8f0;font-size:0.95rem;line-height:1.8;">
            <b style="color:#f0c040;">2.</b> اضغط على زر <b>«افتح الكورس»</b>
          </td></tr>
          <tr><td style="color:#e2e8f0;font-size:0.95rem;line-height:1.8;">
            <b style="color:#f0c040;">3.</b> أدخل بريدك الإلكتروني: <b style="color:#22c55e;">${toEmail}</b>
          </td></tr>
          <tr><td style="color:#e2e8f0;font-size:0.95rem;line-height:1.8;">
            <b style="color:#f0c040;">4.</b> أدخل كود التفعيل: <b style="color:#22c55e;font-family:monospace;font-size:1.1rem;">${code}</b>
          </td></tr>
          <tr><td style="color:#e2e8f0;font-size:0.95rem;line-height:1.8;">
            <b style="color:#f0c040;">5.</b> اضغط <b>«تفعيل الكورس»</b> — يفتح فوراً على جهازك ✅
          </td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #2d3148;margin:24px 0;">
        <p style="color:#64748b;font-size:0.82rem;text-align:center;">
          ⚠️ هذا الكود مخصص لك شخصياً ومرتبط ببريدك الإلكتروني.<br>
          للمساعدة: واتساب <a href="https://wa.me/201012913203" style="color:#f0c040;">+201012913203</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
  });

  if (error) {
    console.error('Resend error:', error);
    return false;
  }
  console.log('Email sent via Resend:', data?.id);
  return true;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Gumroad sends URL-encoded form data
    const params = new URLSearchParams(event.body);
    const email = params.get('email');
    const productName = params.get('product_name') || '';
    const isTest = params.get('test') === 'true';

    console.log(`Gumroad webhook received — email: ${email}, product: ${productName}, test: ${isTest}`);

    if (!email) {
      return { statusCode: 400, body: 'Missing email' };
    }

    // Skip test purchases silently
    if (isTest) {
      console.log('Test purchase — skipping email');
      return { statusCode: 200, body: JSON.stringify({ success: true, test: true }) };
    }

    const code = generateCode(email);
    await sendCodeEmail(email, code);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: 'Internal server error' };
  }
};
