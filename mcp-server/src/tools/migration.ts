import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { TenantRegistry } from '../tenants.js'
import { audit, defineTool, progressReporter, idSchema } from '../tool.js'
import { exportProject } from '../migration/export.js'
import { importProject, type ImportReport } from '../migration/importer.js'
import { throttledGateway } from '../migration/throttle.js'

const importOptionsShape = {
  target_project_id: idSchema.optional().describe('Projeto existente no tenant destino. Reaproveita sprints/colunas por nome e pula títulos similares >=0,9.'),
  user_mapping: z
    .record(z.string(), z.string())
    .optional()
    .describe('Mapeamento manual de pessoas: { "<user_id ou e-mail de origem>": "<user_id ou e-mail no destino>" }. Sem ele, casa por e-mail.'),
  new_name: z.string().min(1).optional().describe('Nome do projeto no destino (padrão: o mesmo da origem; precisa ser único no tenant).'),
  include_comments: z.boolean().optional().describe('Copia os comentários (padrão true).'),
  dry_run: z
    .boolean()
    .optional()
    .describe('Padrão true: só valida e mostra o plano (contagens, pessoas sem correspondente, avisos), sem gravar nada. Revise com o usuário e repita com dry_run=false.'),
}

function reportSummary(report: ImportReport) {
  return {
    ...report,
    summary: report.dry_run
      ? `Simulação: nada foi gravado. ${report.unmapped_users.length} pessoa(s) sem correspondente no destino.`
      : `Criados: ${Object.entries(report.counts.created).map(([k, v]) => `${k}=${v}`).join(', ')}. ` +
        `Erros: ${report.errors.length}. Pulados: ${report.skipped.length}.`,
  }
}

export function registerMigrationTools(server: McpServer, registry: TenantRegistry) {
  defineTool(
    server,
    registry,
    'operum_export_project',
    {
      title: 'Exportar projeto',
      description:
        'Exporta o projeto inteiro num JSON (format operum-project/v1): dados e termo de abertura, macro-fases, membros e responsáveis (com e-mail), stakeholders, etiquetas, sprints com colunas, tarefas e comentários. Anexos vão só como referência. Para copiar entre tenants prefira operum_copy_project — o bundle não precisa passar pela conversa.',
      inputSchema: { project_id: idSchema, include_comments: z.boolean().optional() },
      entity: 'Projeto',
      annotations: { readOnlyHint: true },
    },
    async ({ project_id, include_comments }, ctx, extra) => {
      const bundle = await exportProject(ctx, throttledGateway(ctx.gw), project_id, {
        includeComments: include_comments !== false,
        progress: progressReporter(extra),
      })
      return { bundle }
    },
  )

  defineTool(
    server,
    registry,
    'operum_import_project',
    {
      title: 'Importar projeto',
      description:
        'Recria em outro tenant um projeto exportado por operum_export_project. Pessoas são casadas por e-mail (ou user_mapping); quem não existir no destino fica sem vínculo e aparece em unmapped_users. Retorna relatório com criados/pulados/erros e o mapa de ids origem→destino.',
      inputSchema: {
        target_tenant_id: idSchema.describe('Tenant de destino (precisa ter token configurado).'),
        bundle: z.record(z.string(), z.unknown()).describe('JSON devolvido por operum_export_project (campo bundle).'),
        ...importOptionsShape,
      },
      entity: 'Projeto',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ target_tenant_id, bundle, user_mapping, new_name, include_comments, dry_run, target_project_id }, _ctx, extra) => {
      const target = await registry.resolve(target_tenant_id)
      const report = await importProject(target, throttledGateway(target.gw), bundle, {
        targetProjectId: target_project_id,
        userMapping: user_mapping,
        newName: new_name,
        includeComments: include_comments !== false,
        dryRun: dry_run !== false,
        progress: progressReporter(extra),
      })
      if (!report.dry_run) {
        await audit(target, 'operum_import_project', 'IMPORT', 'project', report.target.project_id, {
          sourceTenantId: report.source.tenant_id,
          sourceProjectId: report.source.project_id,
          errors: report.errors.length,
        })
      }
      return reportSummary(report)
    },
  )

  defineTool(
    server,
    registry,
    'operum_copy_project',
    {
      title: 'Copiar projeto entre tenants',
      description:
        'Exporta o projeto do tenant de origem e o recria no tenant de destino numa única chamada (sem o JSON passar pela conversa). dry_run=true (padrão) só mostra o plano. Pessoas casadas por e-mail. Relatório final com criados, pulados e erros.',
      inputSchema: {
        source_tenant_id: idSchema.optional().describe('Tenant de origem (padrão: tenant do token padrão).'),
        project_id: idSchema.describe('Projeto no tenant de origem.'),
        target_tenant_id: idSchema,
        ...importOptionsShape,
      },
      entity: 'Projeto',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ source_tenant_id, project_id, target_tenant_id, user_mapping, new_name, include_comments, dry_run, target_project_id }, _ctx, extra) => {
      const progress = progressReporter(extra)
      const source = await registry.resolve(source_tenant_id)
      const target = await registry.resolve(target_tenant_id)
      const includeComments = include_comments !== false

      const bundle = await exportProject(source, throttledGateway(source.gw), project_id, { includeComments, progress })
      const report = await importProject(target, throttledGateway(target.gw), bundle, {
        targetProjectId: target_project_id,
        userMapping: user_mapping,
        newName: new_name,
        includeComments,
        dryRun: dry_run !== false,
        progress,
      })
      if (!report.dry_run) {
        await audit(target, 'operum_copy_project', 'IMPORT', 'project', report.target.project_id, {
          sourceTenantId: source.tenantId,
          sourceProjectId: project_id,
          errors: report.errors.length,
        })
      }
      return reportSummary(report)
    },
  )
}
