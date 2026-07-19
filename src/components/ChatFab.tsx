'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import ChatWidget from './ChatWidget'

// Floating "Ask AI" button — fixed to the bottom-right, gradient orb that glows on
// hover. Opens the same centered chat modal used before.
export default function ChatFab() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="chat-fab" aria-label="Ask AI" title="Ask AI" onClick={() => setOpen(true)}>
        <MessageCircle size={26} strokeWidth={2.2} />
      </button>
      {open && <ChatWidget onClose={() => setOpen(false)} />}
    </>
  )
}
