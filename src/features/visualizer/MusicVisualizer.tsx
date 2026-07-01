import { useEffect, useRef } from 'react'
import type { TrackId } from '../../domain/pattern'

type Energy = Record<TrackId, number>

function draw(canvas: HTMLCanvasElement, step: number, energy: Energy, phase: number) {
  const context = canvas.getContext('2d')
  if (!context) return
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = canvas.clientWidth || 900
  const height = canvas.clientHeight || 220
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio
    canvas.height = height * ratio
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
  const colors = ['#ff6453', '#c9ef25', '#48d6e8']
  const values = [energy.drums, energy.bass, energy.melody]
  values.forEach((value, band) => {
    context.fillStyle = colors[band]
    context.globalAlpha = 0.24 + value * 0.55
    for (let index = band; index < 64; index += 3) {
      const x = (index + 0.5) * width / 64
      const activity = value * (0.55 + 0.45 * Math.sin(index * 1.73 + step + phase * 0.4))
      const barHeight = Math.max(2, activity * height * 0.34)
      context.fillRect(x, height / 2 - barHeight / 2, Math.max(2, width / 150), barHeight)
    }
  })
  context.globalAlpha = 1
  const radius = Math.min(68, height * 0.34)
  const centerX = width / 2
  const centerY = height / 2
  context.fillStyle = '#07121c'
  context.beginPath(); context.arc(centerX, centerY, radius, 0, Math.PI * 2); context.fill()
  context.strokeStyle = colors[step % 3]
  context.lineWidth = 5
  context.setLineDash([3, 7])
  context.beginPath(); context.arc(centerX, centerY, radius - 5, -Math.PI / 2, Math.PI * 1.5); context.stroke()
  context.setLineDash([])
  context.fillStyle = '#f3f7f8'; context.textAlign = 'center'; context.font = '700 42px system-ui'; context.fillText(String(step + 1), centerX, centerY + 8)
  context.fillStyle = '#8294a3'; context.font = '600 13px system-ui'; context.fillText('/ 16', centerX, centerY + 30)
}

export function MusicVisualizer({ activeStep, energy }: { activeStep: number; energy: Energy }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let frame = 0
    const render = (time: number) => {
      draw(canvas, activeStep, energy, reducedMotion ? activeStep : time / 650)
      if (!reducedMotion) frame = requestAnimationFrame(render)
    }
    render(0)
    return () => cancelAnimationFrame(frame)
  }, [activeStep, energy])
  return <canvas ref={canvasRef} className="visualizer" role="img" aria-label={`Music visualization, step ${activeStep + 1} of 16`} />
}
