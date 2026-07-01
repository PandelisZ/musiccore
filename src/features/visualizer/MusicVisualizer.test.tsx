import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MusicVisualizer } from './MusicVisualizer'

describe('MusicVisualizer', () => {
  it('announces the synchronized step and supports a static canvas fallback', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null)
    render(<MusicVisualizer activeStep={7} energy={{ drums: 1, bass: 0.5, melody: 0.25 }} />)
    expect(screen.getByLabelText('Music visualization, step 8 of 16')).toBeInTheDocument()
  })
})
