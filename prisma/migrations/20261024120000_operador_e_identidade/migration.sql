-- Segurança (ADR-060 e ADR-061): operador da plataforma separado do admin de
-- instituição, e vínculo explícito entre as contas da mesma pessoa.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "identityId" TEXT,
ADD COLUMN     "platformOperator" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_identityId_idx" ON "User"("identityId");

-- Operadores iniciais: os admins atuais das instituições da Mavellium. Os demais
-- admins passam a valer só dentro da própria instituição.
UPDATE "User" u
SET "platformOperator" = true
FROM "Tenant" t
WHERE u."tenantId" = t."id"
  AND t."subdomain" IN ('mavellium', 'mavellium-main')
  AND u."role" = 'admin'
  AND u."deletedAt" IS NULL;

-- Vínculos já comprovados: contas com o mesmo e-mail e o mesmo hash de senha
-- (criadas por provisionTenantAdmin, que copia o hash). As demais contas da
-- mesma pessoa se vinculam na primeira troca, confirmando a senha de destino.
UPDATE "User" u
SET "identityId" = g."firstId"
FROM (
  SELECT "email", "passwordHash", MIN("id") AS "firstId"
  FROM "User"
  WHERE "deletedAt" IS NULL
  GROUP BY "email", "passwordHash"
  HAVING COUNT(*) > 1
) g
WHERE u."email" = g."email"
  AND u."passwordHash" = g."passwordHash"
  AND u."deletedAt" IS NULL;
