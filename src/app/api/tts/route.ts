import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Natural text-to-speech via Gemini's TTS model — reuses the existing GEMINI_API_KEY.
// Returns a WAV (base64) the browser can play directly. The client falls back to the
// built-in robotic speechSynthesis if this endpoint fails.
const GEMINI_KEY = process.env.GEMINI_API_KEY
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'
const VOICE = process.env.GEMINI_TTS_VOICE || 'Aoede' // warm, natural female voice

// Gemini returns raw 16-bit PCM @ 24kHz mono — wrap it in a WAV header for <audio>.
function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)          // fmt chunk size
  header.writeUInt16LE(1, 20)           // PCM
  header.writeUInt16LE(1, 22)           // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32)           // block align
  header.writeUInt16LE(16, 34)          // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY) return NextResponse.json({ error: 'TTS not configured' }, { status: 500 })
  try {
    const { text } = await req.json()
    const clean = String(text || '').trim().slice(0, 900) // keep responses snappy/cheap
    if (!clean) return NextResponse.json({ error: 'no text' }, { status: 400 })

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: clean }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'TTS failed', detail: err.slice(0, 300) }, { status: 502 })
    }
    const data = await res.json()
    const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)
    if (!part) return NextResponse.json({ error: 'no audio returned' }, { status: 502 })

    const rateMatch = String(part.inlineData.mimeType || '').match(/rate=(\d+)/)
    const wav = pcmToWav(Buffer.from(part.inlineData.data, 'base64'), rateMatch ? Number(rateMatch[1]) : 24000)
    return NextResponse.json({ audio: wav.toString('base64'), mime: 'audio/wav' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
