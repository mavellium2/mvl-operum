CREATE TABLE "ProjetoOperacao" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "resultado" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjetoOperacao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjetoOperacao_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjetoOperacao_tenantId_projectId_userId_requestId_key" ON "ProjetoOperacao"("tenantId", "projectId", "userId", "requestId");
