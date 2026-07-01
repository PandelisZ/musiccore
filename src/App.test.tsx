import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AudioEngine } from './audio/types'

function fakeAudioEngine(): AudioEngine {
  return {
    currentTime: () => 0,
    start: vi.fn().mockResolvedValue(undefined),
    scheduleVoice: vi.fn(),
    stopAll: vi.fn(),
    cleanup: vi.fn(),
  }
}

describe('Musiccore instrument', () => {
  it('renders three accessible sixteen-step tracks and edits a step', async () => {
    render(<App audioEngine={fakeAudioEngine()} />)

    expect(screen.getAllByRole('button', { name: /step \d+/i })).toHaveLength(48)
    const firstStep = screen.getByRole('button', { name: 'Drums step 1' })
    expect(firstStep).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(firstStep)
    expect(firstStep).toHaveAttribute('aria-pressed', 'true')
  })

  it('generates, mutates, clears, and starts and stops playback', async () => {
    const engine = fakeAudioEngine()
    render(<App audioEngine={engine} />)

    await userEvent.click(screen.getByRole('button', { name: /generate loop/i }))
    expect(screen.getAllByRole('button', { pressed: true }).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: /^mutate$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }))
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: /^play$/i }))
    await waitFor(() => expect(engine.start).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /^stop$/i })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: /^stop$/i }))
    expect(engine.stopAll).toHaveBeenCalled()
  })

  it('exposes musical controls with their current values', async () => {
    render(<App audioEngine={fakeAudioEngine()} />)
    const tempo = screen.getByRole('slider', { name: /tempo/i })
    fireEvent.change(tempo, { target: { value: '140' } })
    expect(screen.getByText('140', { selector: '.control-value' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /key/i })).toHaveValue('A')
    expect(screen.getByRole('combobox', { name: /scale/i })).toHaveValue('minor')
  })
})
