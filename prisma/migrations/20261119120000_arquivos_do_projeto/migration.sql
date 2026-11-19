-- Fotos e Vídeos e Apresentação e Vídeo do projeto (ajustes de 18/11/2026).
CREATE TYPE "CategoriaArquivoProjeto" AS ENUM ('FOTOS_VIDEOS', 'APRESENTACAO');

CREATE TABLE "ArquivoProjeto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "categoria" "CategoriaArquivoProjeto" NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "enviadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ArquivoProjeto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArquivoProjeto_chave_key" ON "ArquivoProjeto"("chave");
CREATE INDEX "ArquivoProjeto_tenantId_projetoId_categoria_deletedAt_idx" ON "ArquivoProjeto"("tenantId", "projetoId", "categoria", "deletedAt");

ALTER TABLE "ArquivoProjeto" ADD CONSTRAINT "ArquivoProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArquivoProjeto" ADD CONSTRAINT "ArquivoProjeto_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
