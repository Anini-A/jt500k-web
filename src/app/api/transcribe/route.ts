import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Speech-to-text via Gemini audio understanding — works in the iOS installed PWA
// (where the browser SpeechRecognition API is blocked). Reuses the free Gemini key.
const GEMINI_KEY = process.env.GEMINI_API_KEY
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY) return NextResponse.json({ error: 'Transcription not configured' }, { status: 500 })
  try {
    const { audio, mime } = await req.json()
    if (!audio) return NextResponse.json({ error: 'no audio' }, { status: 400 })

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mime || 'audio/mp4', data: audio } },
            { text: 'Transcribe this audio verbatim. Return ONLY the exact words spoken in English — no commentary, no quotes. If there is no clear speech, return an empty string.' },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Transcription failed', detail: err.slice(0, 300) }, { status: 502 })
    }
    const data = await res.json()
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text || '').join('').trim()
    return NextResponse.json({ text })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
