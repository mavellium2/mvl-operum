-- Histórico de versões do Editar projeto (linear, como commits). Tabela nova;
-- nenhum dado existente é alterado.
CREATE TABLE "ProjetoVersao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "conteudo" JSONB NOT NULL,
    "alteracoes" JSONB NOT NULL,
    "restauradaDe" INTEGER,
    "autorId" TEXT,
    "autorNome" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjetoVersao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjetoVersao_projectId_numero_key" ON "ProjetoVersao"("projectId", "numero");
CREATE INDEX "ProjetoVersao_tenantId_projectId_idx" ON "ProjetoVersao"("tenantId", "projectId");

ALTER TABLE "ProjetoVersao" ADD CONSTRAINT "ProjetoVersao_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
