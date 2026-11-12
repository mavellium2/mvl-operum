-- Cargo do membro nunca fica "A | B": funções são separadas por vírgula ("A, B").
-- 1. Corrige o que já foi gravado com "|" ou ";" (ex.: pela API/MCP antes da regra).
UPDATE "UserProject"
SET "role" = NULLIF(trim(both ', ' from regexp_replace(regexp_replace("role", '\s*[|;]\s*', ', ', 'g'), '\s*,\s*(,\s*)*', ', ', 'g')), '')
WHERE "role" ~ '[|;]';

-- Funções do externo: cada item uma função só.
UPDATE "ProjectStakeholder" ps
SET "funcoes" = (
  SELECT COALESCE(array_agg(DISTINCT trim(parte)) FILTER (WHERE trim(parte) <> ''), ARRAY[]::TEXT[])
  FROM unnest(ps."funcoes") AS f(item), regexp_split_to_table(f.item, '\s*[|;,]\s*') AS parte
)
WHERE array_to_string(ps."funcoes", chr(1)) ~ '[|;,]';

-- 2. Trava no banco: qualquer gravação com "|" ou ";" é recusada, venha de onde vier.
ALTER TABLE "UserProject" ADD CONSTRAINT "UserProject_role_sem_separador" CHECK ("role" IS NULL OR "role" !~ '[|;]');
ALTER TABLE "ProjectStakeholder" ADD CONSTRAINT "ProjectStakeholder_funcoes_uma_por_item" CHECK (array_to_string("funcoes", chr(1)) !~ '[|;,]');
