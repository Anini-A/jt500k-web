import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Speech-to-text via Gemini audio understanding — works in the iOS installed PWA
// (where the browser SpeechRecognition API is blocked). Reuses the free Gemini key.
const GEMINI_KEY = process.env.GEMINI_API_KEY
// gemini-2.5-flash(-lite) was sunset for new users (Google's own 404 names
// models/gemini-3.8-flash as the live replacement). The -lite guess is tried first
// for cost/speed, following the naming convention every prior generation used; MODELS
// below falls straight through to the confirmed name if that guess doesn't exist.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash-lite'
const MODELS = [MODEL, 'gemini-3.8-flash'].filter((m, i, a) => m && a.indexOf(m) === i)

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY) return NextResponse.json({ error: 'Transcription not configured' }, { status: 500 })
  try {
    const { audio, mime } = await req.json()
    if (!audio) return NextResponse.json({ error: 'no audio' }, { status: 400 })

    const body = JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: mime || 'audio/mp4', data: audio } },
          { text: 'Transcribe this audio verbatim. Return ONLY the exact words spoken in English — no commentary, no quotes. If there is no clear speech, return an empty string.' },
        ],
      }],
      generationConfig: { temperature: 0 },
    })

    let lastErr = ''
    for (const model of MODELS) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      })
      if (!res.ok) { lastErr = (await res.text()).slice(0, 300); continue }
      const data = await res.json()
      const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text || '').join('').trim()
      return NextResponse.json({ text })
    }
    return NextResponse.json({ error: 'Transcription failed', detail: lastErr }, { status: 502 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
