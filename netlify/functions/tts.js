// netlify/functions/tts.js
// Natural-sounding read-aloud for the interactive quizzes (Gemini TTS).
// GET /.netlify/functions/tts?text=... → audio/wav
// Needs GEMINI_API_KEY in the Netlify environment variables.

const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';
const MAX_CHARS = 300;

// Gemini returns raw 16-bit mono PCM at 24 kHz — wrap it in a WAV header
function pcmToWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'GET only' }) };
  }
  if ((event.headers['sec-fetch-site'] || '') === 'cross-site') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'TTS not configured' }) };
  }

  const text = String((event.queryStringParameters || {}).text || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_CHARS) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad text' }) };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Read this aloud slowly and clearly, in a warm, friendly teacher's voice for a young English learner: ${text}` }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
          }
        })
      }
    );
    if (!res.ok) {
      console.error('Gemini TTS error', res.status, await res.text());
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'TTS failed' }) };
    }
    const data = await res.json();
    const b64 = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!b64) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No audio' }) };
    }
    const wav = pcmToWav(Buffer.from(b64, 'base64'));
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'audio/wav',
        // same sentence → same audio, so let the browser and Netlify's CDN reuse it
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable'
      },
      body: wav.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    console.error('TTS exception', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'TTS failed' }) };
  }
};
