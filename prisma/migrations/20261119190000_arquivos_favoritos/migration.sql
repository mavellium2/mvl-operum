-- Estrela pessoal nos arquivos do projeto (Fotos e Vídeos / Apresentação e Vídeo).
CREATE TABLE "ArquivoProjetoFavorito" (
    "arquivoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArquivoProjetoFavorito_pkey" PRIMARY KEY ("arquivoId", "userId")
);

CREATE INDEX "ArquivoProjetoFavorito_userId_tenantId_idx" ON "ArquivoProjetoFavorito"("userId", "tenantId");

ALTER TABLE "ArquivoProjetoFavorito" ADD CONSTRAINT "ArquivoProjetoFavorito_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "ArquivoProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArquivoProjetoFavorito" ADD CONSTRAINT "ArquivoProjetoFavorito_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
