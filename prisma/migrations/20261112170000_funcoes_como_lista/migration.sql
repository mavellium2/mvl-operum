-- Funções do membro e do externo deixam de ser texto ("A, B") e viram uma lista de
-- vínculos com o cadastro de funções (Role). Nada é gravado com separador.

CREATE TABLE "UserProjectFuncao" (
  "id" TEXT NOT NULL,
  "userProjectId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "UserProjectFuncao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserProjectFuncao_userProjectId_roleId_key" ON "UserProjectFuncao"("userProjectId", "roleId");
CREATE INDEX "UserProjectFuncao_roleId_idx" ON "UserProjectFuncao"("roleId");
ALTER TABLE "UserProjectFuncao" ADD CONSTRAINT "UserProjectFuncao_userProjectId_fkey" FOREIGN KEY ("userProjectId") REFERENCES "UserProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProjectFuncao" ADD CONSTRAINT "UserProjectFuncao_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProjectStakeholderFuncao" (
  "id" TEXT NOT NULL,
  "projectStakeholderId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProjectStakeholderFuncao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectStakeholderFuncao_projectStakeholderId_roleId_key" ON "ProjectStakeholderFuncao"("projectStakeholderId", "roleId");
CREATE INDEX "ProjectStakeholderFuncao_roleId_idx" ON "ProjectStakeholderFuncao"("roleId");
ALTER TABLE "ProjectStakeholderFuncao" ADD CONSTRAINT "ProjectStakeholderFuncao_projectStakeholderId_fkey" FOREIGN KEY ("projectStakeholderId") REFERENCES "ProjectStakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectStakeholderFuncao" ADD CONSTRAINT "ProjectStakeholderFuncao_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Conversão dos dados atuais ───────────────────────────────────────────────
-- Cada nome do texto antigo (separado por "|", ";" ou ",") vira um vínculo com a
-- função do cadastro da instituição: a de mesmo nome (sem diferenciar maiúsculas);
-- "Gerente de Projeto(s)" é o papel de gerente do sistema; sem nenhuma, a função é
-- criada. Equivalências por acento/plural são fundidas depois por scripts/dedupe-funcoes.ts.
CREATE TEMP TABLE "_nomes" AS
SELECT 'membro'::text AS tipo, up."id" AS dono, p."tenantId" AS tenant, trim(x.nome) AS nome, x.ord::int AS ord
FROM "UserProject" up
JOIN "Project" p ON p."id" = up."projectId",
LATERAL regexp_split_to_table(up."role", '\s*[|;,]\s*') WITH ORDINALITY AS x(nome, ord)
WHERE up."role" IS NOT NULL AND trim(x.nome) <> ''
UNION ALL
SELECT 'externo', ps."id", p."tenantId", trim(x.nome), (f.i * 100 + x.ord)::int
FROM "ProjectStakeholder" ps
JOIN "Project" p ON p."id" = ps."projectId",
LATERAL unnest(ps."funcoes") WITH ORDINALITY AS f(item, i),
LATERAL regexp_split_to_table(f.item, '\s*[|;,]\s*') WITH ORDINALITY AS x(nome, ord)
WHERE trim(x.nome) <> '';

-- Papel de gerente onde for preciso.
INSERT INTO "Role" ("id", "nome", "nomeKey", "escopo", "tenantId", "createdAt", "updatedAt")
SELECT DISTINCT 'gerente_' || md5(n.tenant), 'Gerente de Projeto', 'gerente', 'PROJETO'::"RoleScope", n.tenant, now(), now()
FROM "_nomes" n
WHERE lower(n.nome) IN ('gerente de projeto', 'gerente de projetos')
ON CONFLICT ("nomeKey", "tenantId", "escopo") DO UPDATE SET "deletedAt" = NULL;

-- Funções que ainda não existem no cadastro.
INSERT INTO "Role" ("id", "nome", "nomeKey", "escopo", "tenantId", "createdAt", "updatedAt")
SELECT DISTINCT ON (n.tenant, lower(n.nome))
  'fn_' || md5(n.tenant || lower(n.nome)), n.nome,
  trim(both '-' from regexp_replace(translate(lower(n.nome), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g')),
  'TENANT'::"RoleScope", n.tenant, now(), now()
FROM "_nomes" n
WHERE lower(n.nome) NOT IN ('gerente de projeto', 'gerente de projetos')
  AND NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."tenantId" = n.tenant AND lower(r."nome") = lower(n.nome))
ORDER BY n.tenant, lower(n.nome), n.nome
ON CONFLICT ("nomeKey", "tenantId", "escopo") DO NOTHING;

-- Função escolhida para cada nome (ativa antes de excluída; mais antiga antes).
CREATE TEMP TABLE "_funcao" AS
SELECT DISTINCT ON (n.tipo, n.dono, lower(n.nome)) n.tipo, n.dono, r."id" AS role_id, n.ord
FROM "_nomes" n
JOIN "Role" r ON r."tenantId" = n.tenant AND (
  (lower(n.nome) IN ('gerente de projeto', 'gerente de projetos') AND r."nomeKey" = 'gerente' AND r."escopo" = 'PROJETO')
  OR (lower(n.nome) NOT IN ('gerente de projeto', 'gerente de projetos') AND (
    lower(r."nome") = lower(n.nome)
    OR r."nomeKey" = trim(both '-' from regexp_replace(translate(lower(n.nome), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g'))
  ))
)
ORDER BY n.tipo, n.dono, lower(n.nome), (r."deletedAt" IS NOT NULL), (lower(r."nome") = lower(n.nome)) DESC, r."createdAt";

UPDATE "Role" SET "deletedAt" = NULL WHERE "id" IN (SELECT role_id FROM "_funcao") AND "deletedAt" IS NOT NULL;

INSERT INTO "UserProjectFuncao" ("id", "userProjectId", "roleId", "ordem")
SELECT 'upf_' || md5(f.dono || f.role_id), f.dono, f.role_id, min(f.ord) FROM "_funcao" f WHERE f.tipo = 'membro'
GROUP BY f.dono, f.role_id
ON CONFLICT ("userProjectId", "roleId") DO NOTHING;

INSERT INTO "ProjectStakeholderFuncao" ("id", "projectStakeholderId", "roleId", "ordem")
SELECT 'psf_' || md5(f.dono || f.role_id), f.dono, f.role_id, min(f.ord) FROM "_funcao" f WHERE f.tipo = 'externo'
GROUP BY f.dono, f.role_id
ON CONFLICT ("projectStakeholderId", "roleId") DO NOTHING;

-- ── Fim dos campos de texto ─────────────────────────────────────────────────
ALTER TABLE "UserProject" DROP CONSTRAINT IF EXISTS "UserProject_role_sem_separador";
ALTER TABLE "ProjectStakeholder" DROP CONSTRAINT IF EXISTS "ProjectStakeholder_funcoes_uma_por_item";
ALTER TABLE "UserProject" DROP COLUMN "role";
ALTER TABLE "ProjectStakeholder" DROP COLUMN "funcoes";
