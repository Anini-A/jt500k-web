import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Mints a short-lived EPHEMERAL token for the Gemini Live API so the browser can open
// a streaming WebSocket WITHOUT ever seeing the real GEMINI_API_KEY. The token is good
// for a single session that must start within ~1 min and can't outlive ~2 min.
const GEMINI_KEY = process.env.GEMINI_API_KEY
// single source of truth for the real-time VOICE model — returned to the client so the
// socket setup can never drift from what the token was minted for
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'

export async function POST() {
  if (!GEMINI_KEY) return NextResponse.json({ error: 'not configured' }, { status: 500 })
  try {
    const now = Date.now()
    const res = await fetch(`https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uses: 1,                                                    // one session
        expireTime: new Date(now + 2 * 60 * 1000).toISOString(),   // token dead after 2 min
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(), // must connect within 1 min
        // bind the token to the exact Live setup — an unconstrained token is rejected by
        // the Bidi socket ("API key not valid"). REST field is bidiGenerateContentSetup.
        bidiGenerateContentSetup: {
          model: `models/${LIVE_MODEL}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
          },
        },
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json({ error: 'token failed', detail: detail.slice(0, 300) }, { status: 502 })
    }
    const data = await res.json()
    // data.name looks like "auth_tokens/abc..." — that whole string is the ephemeral key.
    // return the model too so the client's socket setup always matches the token.
    return NextResponse.json({ token: data.name, model: `models/${LIVE_MODEL}` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
