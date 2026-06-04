const jsonHeaders = origin => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

const sendJson = (data, status = 200, origin = '*') =>
  new Response(JSON.stringify(data), { status, headers: jsonHeaders(origin) });

function extractJson(text) {
  const clean = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Claude returned non-JSON');
  }
}

function usageMetadata(usage = {}) {
  const promptTokenCount = usage.input_tokens || 0;
  const candidatesTokenCount = usage.output_tokens || 0;
  return {
    promptTokenCount,
    candidatesTokenCount,
    totalTokenCount: promptTokenCount + candidatesTokenCount
  };
}

async function callClaude(env, content, maxTokens = 900, temperature = 0.25) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Anthropic key is not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content }]
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `Anthropic API ${res.status}`);
  }
  const text = (body.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n').trim();
  if (!text) throw new Error('Claude returned no text');
  return { data: extractJson(text), usageMetadata: usageMetadata(body.usage) };
}

function foodSwapPrompt(craving, preference) {
  return `You are helping a GLP-1 user choose a practical food swap. Do not give medical advice. Suggest one healthier alternative and a simple recipe. The user wants: ${craving}. Preference: ${preference}. Make it realistic, satisfying, higher protein where suitable, gentle on nausea/reflux where suitable, and avoid moralising language. Return compact JSON only with keys: title, swap, ingredients (array of 5-8 strings), steps (array of 4-6 strings), note.`;
}

function mealPhotoPrompt(context, mealType) {
  return `You are estimating a food log for a GLP-1 user from a meal photo. Be useful but cautious: photo calorie estimates are approximate and the user must review before saving. Look for hidden calorie sources like oil, butter, sauces, cheese, nuts, sugar drinks, alcohol, and large portions. Context from user: ${context || 'none'}. Meal type: ${mealType || 'Meal'}. Return compact JSON only with keys: meal, items (array of strings), calories, protein, carbs, fat, fatty (Yes/No), spicy (Yes/No), caffeine (Yes/No), confidence (Low/Medium/High), glpNotes, reviewPrompt. If unsure, choose conservative ranges collapsed to one reasonable midpoint and explain uncertainty in glpNotes.`;
}

async function mealPhoto(body, env) {
  const { photo, context = '', mealType = 'Meal' } = body || {};
  if (!photo?.data || !photo?.mimeType) throw new Error('Meal photo is missing');
  const { data, usageMetadata: usage } = await callClaude(env, [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: photo.mimeType,
        data: photo.data
      }
    },
    { type: 'text', text: mealPhotoPrompt(context, mealType) }
  ]);
  return { ...data, source: 'Claude Sonnet via Cloudflare Worker', usageMetadata: usage };
}

async function foodSwap(body, env) {
  const { craving = '', preference = 'High-protein' } = body || {};
  if (!String(craving).trim()) throw new Error('Food craving is missing');
  const { data, usageMetadata: usage } = await callClaude(env, [
    { type: 'text', text: foodSwapPrompt(craving, preference) }
  ], 800, 0.65);
  return { ...data, source: 'Claude Sonnet via Cloudflare Worker', usageMetadata: usage };
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return new Response(null, { headers: jsonHeaders(origin) });
    if (request.method !== 'POST') return sendJson({ error: 'POST only' }, 405, origin);

    const path = new URL(request.url).pathname;
    let body = {};
    try {
      body = await request.json();
      if (path === '/meal-photo') return sendJson(await mealPhoto(body, env), 200, origin);
      if (path === '/food-swap') return sendJson(await foodSwap(body, env), 200, origin);
      return sendJson({ error: 'Not found' }, 404, origin);
    } catch (err) {
      return sendJson({ error: String(err.message || err) }, 400, origin);
    }
  }
};
