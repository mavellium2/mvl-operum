import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UserAvatar from '@/components/user/UserAvatar'
import AvatarUpload from '@/components/profile/AvatarUpload'
import { safeAvatarUrl } from '@/lib/validation/avatarUrl'

vi.mock('@/app/actions/profile', () => ({ uploadAvatarAction: vi.fn() }))

describe('UserAvatar', () => {
  it('renders initials from two-word name', () => {
    render(<UserAvatar name="João Silva" />)
    expect(screen.getByText('JS')).toBeInTheDocument()
  })

  it('renders single initial for one-word name', () => {
    render(<UserAvatar name="Ana" />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('falls back to "?" when name is undefined', () => {
    render(<UserAvatar name={undefined} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('applies title attribute with full name', () => {
    render(<UserAvatar name="João Silva" />)
    const el = screen.getByTitle('João Silva')
    expect(el).toBeInTheDocument()
  })

  it.each([
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
    'data:image/svg+xml,<svg onload=alert(1)>', '<img src=x onerror=alert(1)>',
    'https://example.com/<script>', 'java\nscript:alert(1)',
    '//example.com/avatar.png', '/\\example.com/avatar.png', 'file:///tmp/avatar.png',
  ])('usa iniciais para URL insegura: %s', (avatarUrl) => {
    render(<UserAvatar name="João Silva" avatarUrl={avatarUrl} />)
    expect(screen.getByText('JS')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(safeAvatarUrl(avatarUrl)).toBeUndefined()
  })

  it.each([
    'https://storage.example.com/avatar.png?signature=abc&expires=123',
    'http://localhost:9000/avatars/avatar.png', '/api/avatars/avatar.png',
  ])('preserva imagem e query de URL permitida: %s', (avatarUrl) => {
    render(<UserAvatar name="João Silva" avatarUrl={avatarUrl} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', avatarUrl)
  })

  it('bloqueia URL insegura na visualização compartilhada', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<AvatarUpload name="João Silva" avatarUrl="javascript:alert(1)" />)
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar foto de perfil' }))
    expect(document.querySelector('img')).toBeNull()
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('mostra imagem válida no modal sem abrir outra janela', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<AvatarUpload name="João Silva" avatarUrl="https://storage.example.com/avatar.png" />)
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar foto de perfil' }))
    expect(screen.getByRole('dialog', { name: 'Foto de perfil' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Foto de João Silva' })).toHaveAttribute('src', 'https://storage.example.com/avatar.png')
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })
})
