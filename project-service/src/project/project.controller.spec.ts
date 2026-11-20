// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { filtrosDaQuery, ProjectController } from './project.controller'

describe('ProjectController.getUserProjects', () => {
  let controller: ProjectController
  let service: { getUserActiveProjects: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    service = { getUserActiveProjects: vi.fn().mockResolvedValue([]) }
    controller = new ProjectController(service as never)
  })

  it('permite quando o :userId da URL é o mesmo do x-user-id (consultando os próprios projetos)', () => {
    controller.getUserProjects('user-1', 'user-1', 'member', 'tenant-a')
    expect(service.getUserActiveProjects).toHaveBeenCalledWith('user-1', 'tenant-a', undefined)
  })

  it('permite quando o chamador é admin, mesmo consultando outro usuário', () => {
    controller.getUserProjects('user-2', 'admin-1', 'admin', 'tenant-a')
    expect(service.getUserActiveProjects).toHaveBeenCalledWith('user-2', 'tenant-a', undefined)
  })

  it('bloqueia (403) quando um usuário não-admin tenta consultar outro usuário', () => {
    expect(() => controller.getUserProjects('user-2', 'user-1', 'member', 'tenant-a')).toThrow(ForbiddenException)
    expect(service.getUserActiveProjects).not.toHaveBeenCalled()
  })
})

describe('ProjectController.list', () => {
  const service = { list: vi.fn() }
  const controller = new ProjectController(service as never)

  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['page', ['1'], undefined, undefined, undefined, undefined],
    ['limit', undefined, ['9'], undefined, undefined, undefined],
    ['preferred', undefined, undefined, ['p1'], undefined, undefined],
    ['q', undefined, undefined, undefined, ['teste'], undefined],
  ])('recusa parâmetro %s repetido ou em formato de lista', (_name, page, limit, preferred, query, status) => {
    expect(() => controller.list('tenant-a', undefined, page, limit, preferred, query, status)).toThrow(BadRequestException)
    expect(service.list).not.toHaveBeenCalled()
  })

  it('normaliza parâmetros de texto válidos antes de consultar o serviço', () => {
    controller.list('tenant-a', undefined, '2', '9', 'p3,p1, p2,p1,<x>', '  teste  ', 'ACTIVE')
    // Recentes do usuário em ordem, sem repetidos nem IDs inválidos.
    expect(service.list).toHaveBeenCalledWith('tenant-a', 2, 9, undefined, ['p3', 'p1', 'p2'], 'teste', { status: ['ACTIVE'], anos: [], departamentos: [], turmas: [], termos: [], turnos: [] }, false)
  })

  it('aceita filtros repetidos (várias opções) e pede as opções com opcoes=1', () => {
    controller.list('tenant-a', undefined, '1', '9', undefined, undefined, ['ACTIVE', 'COMPLETED'], ['2026', '2025'], 'Gestão', '2', ['5', '5'], 'Vespertino', '1')
    expect(service.list).toHaveBeenCalledWith('tenant-a', 1, 9, undefined, undefined, undefined, {
      status: ['ACTIVE', 'COMPLETED'], anos: [2026, 2025], departamentos: ['Gestão'], turmas: ['2'], termos: ['5'], turnos: ['Vespertino'],
    }, true)
  })

  it.each([
    ['situação desconhecida', { status: 'APAGADO' }],
    ['ano fora do intervalo', { ano: '99999' }],
    ['ano não numérico', { ano: 'abc' }],
    ['turma desconhecida', { turma: '3' }],
    ['valor em objeto', { termo: { x: 1 } }],
    ['lista longa demais', { departamento: Array.from({ length: 51 }, (_, i) => `d${i}`) }],
  ])('recusa filtro inválido: %s', (_nome, params) => {
    expect(() => filtrosDaQuery(params)).toThrow(BadRequestException)
  })
})
