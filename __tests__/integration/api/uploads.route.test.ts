// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.FILE_SERVICE_URL = 'http://file-service'
})

vi.mock('@/lib/routeAuth', () => ({
  verifyRouteSession: vi.fn(),
}))
vi.mock('@/lib/api-client', () => ({
  cardsApi: {
    get: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ default: { user: { findFirst: vi.fn().mockResolvedValue({ role: 'member' }) } } }))
vi.mock('@/services/apiAuthorization', () => ({
  authorizeApi: vi.fn().mockResolvedValue({ allowed: true }),
  isAccessDenied: (e: unknown) => e instanceof Error && e.message === 'negado',
}))
import { POST } from '@/app/api/uploads/route'
import { authorizeApi } from '@/services/apiAuthorization'
import { verifyRouteSession } from '@/lib/routeAuth'
import { cardsApi } from '@/lib/api-client'
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachmentTypes'

const mockVerifyRoute = verifyRouteSession as ReturnType<typeof vi.fn>
const originalFetch = global.fetch

function makeRequest(body: FormData, sessionToken?: string): Request {
  const headers: Record<string, string> = {}
  if (sessionToken) headers['cookie'] = `session=${sessionToken}`
  return new Request('http://localhost/api/uploads', {
    method: 'POST',
    body,
    headers,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authorizeApi).mockResolvedValue({ allowed: true })
  mockVerifyRoute.mockResolvedValue({ userId: 'u1', tenantId: 't1' })
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('POST /api/uploads', () => {
  it('quem só lê o quadro não envia anexo (403, sem chamar o file-service)', async () => {
    vi.mocked(cardsApi.get).mockResolvedValue({ id: 'c1' } as never)
    vi.mocked(authorizeApi).mockRejectedValue(new Error('negado'))
    global.fetch = vi.fn() as never
    const fd = new FormData()
    fd.append('cardId', 'c1')
    fd.append('file', new File(['x'], 'a.png', { type: 'image/png' }))
    const res = await POST(makeRequest(fd, 'tok'))
    expect(res.status).toBe(403)
    expect(authorizeApi).toHaveBeenCalledWith(expect.anything(), 'POST', '/files/upload?cardId=c1')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns 401 without session', async () => {
    mockVerifyRoute.mockResolvedValue(null)
    const form = new FormData()
    const res = await POST(makeRequest(form))
    expect(res.status).toBe(401)
  })

  it('returns 400 without cardId field', async () => {
    const form = new FormData()
    form.set('file', new File(['data'], 'img.png', { type: 'image/png' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for disallowed MIME type', async () => {
    const form = new FormData()
    form.set('cardId', 'c1')
    form.set('file', new File(['<script></script>'], 'pagina.html', { type: 'text/html' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Tipo de arquivo não aceito \(\.html\)/)
  })

  it('returns 413 when the file is over the size limit', async () => {
    const form = new FormData()
    form.set('cardId', 'c1')
    form.set('file', new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'longo.mp4', { type: 'video/mp4' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/O limite é 50 MB/)
    expect(cardsApi.get).not.toHaveBeenCalled()
  })

  it.each([
    ['clip.mp4', 'video/mp4', 'video/mp4'],
    // o navegador não informa o tipo do .mov: a rota resolve pela extensão
    ['gravacao.mov', '', 'video/quicktime'],
  ])('encaminha %s ao file-service como %s → %s', async (nome, tipoInformado, tipoEnviado) => {
    vi.mocked(cardsApi.get).mockResolvedValue({ id: 'c1' } as never)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'att1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    )
    global.fetch = fetchMock
    const form = new FormData()
    form.set('cardId', 'c1')
    form.set('file', new File(['video'], nome, { type: tipoInformado }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(201)
    const enviado = (fetchMock.mock.calls[0][1].body as FormData).get('file') as File
    expect(enviado.type).toBe(tipoEnviado)
    expect(enviado.name).toBe(nome)
  })

  it('returns 201 with Attachment shape on success', async () => {
    vi.mocked(cardsApi.get).mockResolvedValue({ id: 'c1', title: 'Card', description: '', color: '#fff' } as never)
    const attachment = {
      id: 'att1',
      cardId: 'c1',
      fileName: 'photo.jpg',
      fileType: 'image/jpeg',
      filePath: '/uploads/c1/uuid.jpg',
      fileSize: 500,
      uploadedAt: new Date().toISOString(),
    }
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(attachment), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    )

    const form = new FormData()
    form.set('cardId', 'c1')
    form.set('file', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ id: 'att1', cardId: 'c1' })
  })

  it('returns 403 when the card is not accessible (404 do sprint-service)', async () => {
    vi.mocked(cardsApi.get).mockRejectedValue(Object.assign(new Error('Card not found'), { status: 404 }))
    const form = new FormData()
    form.set('cardId', 'c1')
    form.set('file', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(403)
  })

  it('returns 502 (não 403) quando o sprint-service falha ao verificar o card', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(cardsApi.get).mockRejectedValue(Object.assign(new Error('Internal server error'), { status: 500 }))
    const form = new FormData()
    form.set('cardId', 'c1')
    form.set('file', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/verificar o card/)
  })
})
