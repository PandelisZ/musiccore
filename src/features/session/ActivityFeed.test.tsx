import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActivityFeed } from './ActivityFeed'

describe('ActivityFeed', () => {
  it('renders concise public actions with accessible timestamps as text', () => {
    render(<ActivityFeed activity={[
      { id: 1, action: 'created', actor: 'mcp', summary: '<b>Created safely</b>', revision: 1, createdAt: '2026-07-01T10:15:00.000Z' },
      { id: 2, action: 'control', actor: 'human', summary: 'Started playback', revision: 1, createdAt: '2026-07-01T10:16:00.000Z' },
    ]} />)

    expect(screen.getByRole('log', { name: 'Live public activity' })).toBeInTheDocument()
    expect(screen.getByText('<b>Created safely</b>')).toBeInTheDocument()
    expect(document.querySelector('.activity-feed b')).toBeNull()
    expect(screen.getByText('MCP')).toBeInTheDocument()
    expect(screen.getAllByRole('time')).toHaveLength(2)
  })

  it('does not render an empty activity region', () => {
    const { container } = render(<ActivityFeed activity={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
