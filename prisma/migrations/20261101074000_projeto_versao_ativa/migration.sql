ALTER TABLE "ProjetoVersao" ADD COLUMN "ativa" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ProjetoVersao" v SET "ativa" = true WHERE v."numero" = (SELECT MAX(u."numero") FROM "ProjetoVersao" u WHERE u."projectId" = v."projectId");
CREATE UNIQUE INDEX "ProjetoVersao_uma_ativa" ON "ProjetoVersao" ("projectId") WHERE "ativa" = true;
