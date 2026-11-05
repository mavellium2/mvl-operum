CREATE TABLE "PlanilhaVersao" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "conteudo" JSONB NOT NULL,
  "autorId" TEXT NOT NULL,
  "autorNome" TEXT NOT NULL,
  "restauradaDe" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanilhaVersao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlanilhaVersao_tenantId_projectId_numero_key" ON "PlanilhaVersao"("tenantId", "projectId", "numero");
CREATE INDEX "PlanilhaVersao_tenantId_projectId_createdAt_idx" ON "PlanilhaVersao"("tenantId", "projectId", "createdAt");
ALTER TABLE "PlanilhaVersao" ADD CONSTRAINT "PlanilhaVersao_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
