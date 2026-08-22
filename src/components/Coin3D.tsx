'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// one coin face — gold radial + engraved $ + rim ring (mirror for the back cap)
function faceTexture(mirror: boolean) {
  const s = 256, cnv = document.createElement('canvas'); cnv.width = cnv.height = s
  const ctx = cnv.getContext('2d')!
  if (mirror) { ctx.translate(s, 0); ctx.scale(-1, 1) }
  const g = ctx.createRadialGradient(s * 0.4, s * 0.36, s * 0.05, s * 0.5, s * 0.5, s * 0.62)
  g.addColorStop(0, '#fdeeb4'); g.addColorStop(0.5, '#e9b855'); g.addColorStop(0.85, '#bb8430'); g.addColorStop(1, '#8a5e1e')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(110,74,23,0.4)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#6e4a17'; ctx.font = '800 150px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', s / 2, s / 2 + 6)
  const t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

// a gradient equirect environment so the gold reads as real metal (no examples import)
function envTexture() {
  const w = 512, h = 256, cnv = document.createElement('canvas'); cnv.width = w; cnv.height = h
  const ctx = cnv.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#cfd4da'); g.addColorStop(0.72, '#6b6f76'); g.addColorStop(1, '#2b2d31')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  const hl = ctx.createRadialGradient(w * 0.7, h * 0.24, 8, w * 0.7, h * 0.24, 150)
  hl.addColorStop(0, 'rgba(255,255,255,0.95)'); hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hl; ctx.fillRect(0, 0, w, h)
  const t = new THREE.CanvasTexture(cnv); t.mapping = THREE.EquirectangularReflectionMapping
  return t
}

// A rendered-3D gold coin. Flick (swipe) it left/right → spins with friction,
// decelerates and snaps to a face; calls onSpinStart / onSpinStop.
export default function Coin3D({ size = 132, onSpinStart, onSpinStop }: { size?: number; onSpinStart?: () => void; onSpinStop?: () => void }) {
  const mount = useRef<HTMLDivElement>(null)
  const cbStart = useRef(onSpinStart), cbStop = useRef(onSpinStop)
  useEffect(() => { cbStart.current = onSpinStart; cbStop.current = onSpinStop })

  useEffect(() => {
    const el = mount.current; if (!el) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(dpr); renderer.setSize(size, size); renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100); camera.position.set(0, 0, 7)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRT = pmrem.fromEquirectangular(envTexture())
    scene.environment = envRT.texture
    const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(2, 3, 4); scene.add(key)
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))

    const R = 2, TH = 0.26
    const geo = new THREE.CylinderGeometry(R, R, TH, 72)
    const gold = new THREE.MeshStandardMaterial({ color: 0xE7B24E, metalness: 1, roughness: 0.3 })
    const tTop = faceTexture(false), tBot = faceTexture(true)
    const mTop = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.34, map: tTop })
    const mBot = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.34, map: tBot })
    const coin = new THREE.Mesh(geo, [gold, mTop, mBot]); coin.rotation.x = Math.PI / 2
    const group = new THREE.Group(); group.add(coin); group.rotation.x = -0.16; scene.add(group)
    const render = () => renderer.render(scene, camera)
    render()

    const sp = { vel: 0, spinning: false }
    let raf: number | null = null
    const loop = () => {
      sp.vel *= 0.976; group.rotation.y += sp.vel; render()
      if (Math.abs(sp.vel) < 0.006) {
        group.rotation.y = Math.round(group.rotation.y / Math.PI) * Math.PI; render()
        sp.spinning = false; sp.vel = 0; raf = null; cbStop.current?.(); return
      }
      raf = requestAnimationFrame(loop)
    }
    let start: { x: number; t: number } | null = null
    const onDown = (e: PointerEvent) => { start = { x: e.clientX, t: performance.now() } }
    const onUp = (e: PointerEvent) => {
      const st = start; start = null
      if (!st || sp.spinning) return
      const dx = e.clientX - st.x, dt = Math.max(1, performance.now() - st.t)
      if (Math.abs(dx) < 12) return // flick only — ignore taps
      sp.vel = Math.max(0.2, Math.min(0.55, Math.abs(dx / dt) * 0.55)) * (dx < 0 ? -1 : 1)
      sp.spinning = true; cbStart.current?.(); if (!raf) raf = requestAnimationFrame(loop)
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      el.removeEventListener('pointerdown', onDown); window.removeEventListener('pointerup', onUp)
      geo.dispose(); gold.dispose(); mTop.dispose(); mBot.dispose(); tTop.dispose(); tBot.dispose(); envRT.dispose(); pmrem.dispose(); renderer.dispose()
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
  }, [size])

  return <div ref={mount} style={{ width: size, height: size, touchAction: 'pan-y' }} aria-label="Flick the coin" />
}
