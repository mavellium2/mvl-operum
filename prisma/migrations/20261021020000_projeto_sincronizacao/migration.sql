-- Estado da sincronização EAP ↔ planilha ↔ sprints por projeto (card "Exibir
-- status, pendências e opção de repetir a sincronização"). Tabela nova; nenhum
-- dado existente é alterado.
CREATE TABLE "ProjetoSincronizacao" (
    "projectId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "ultimaTentativaEm" TIMESTAMP(3) NOT NULL,
    "ultimaConclusaoEm" TIMESTAMP(3),
    "erro" TEXT,
    "pendencias" JSONB NOT NULL DEFAULT '[]',
    "resumo" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjetoSincronizacao_pkey" PRIMARY KEY ("projectId")
);

CREATE INDEX "ProjetoSincronizacao_tenantId_idx" ON "ProjetoSincronizacao"("tenantId");

ALTER TABLE "ProjetoSincronizacao" ADD CONSTRAINT "ProjetoSincronizacao_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
