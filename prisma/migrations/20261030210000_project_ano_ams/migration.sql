-- Ano da turma do AMS: independente de termo e do ano calendário.
-- Projetos existentes continuam sem classificação; nenhum valor é inferido.
ALTER TABLE "Project" ADD COLUMN "anoAms" TEXT;
ALTER TABLE "Project" ADD CONSTRAINT "Project_anoAms_check"
  CHECK ("anoAms" IS NULL OR ("anoAms" IN ('1', '2') AND "semestre" IS NOT DISTINCT FROM 'ano'));
