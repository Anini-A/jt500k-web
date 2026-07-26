import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Mints a short-lived EPHEMERAL token for the Gemini Live API so the browser can open
// a streaming WebSocket WITHOUT ever seeing the real GEMINI_API_KEY. The token is good
// for a single session that must start within ~1 min and can't outlive ~2 min.
const GEMINI_KEY = process.env.GEMINI_API_KEY

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
        // bind the token to the exact Live model+config — an unconstrained token is
        // rejected by the Bidi socket ("API key not valid")
        liveConnectConstraints: {
          model: 'models/gemini-2.0-flash-live-001',
          config: {
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
    // data.name looks like "auth_tokens/abc..." — that whole string is the ephemeral key
    return NextResponse.json({ token: data.name })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
