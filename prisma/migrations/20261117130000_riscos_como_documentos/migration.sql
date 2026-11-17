-- Formulários de Riscos: cada risco é um documento (como as Atas).
CREATE TABLE "Risco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Risco_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Risco_projetoId_numero_key" ON "Risco"("projetoId", "numero");
CREATE INDEX "Risco_tenantId_projetoId_deletedAt_idx" ON "Risco"("tenantId", "projetoId", "deletedAt");

ALTER TABLE "Risco" ADD CONSTRAINT "Risco_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
