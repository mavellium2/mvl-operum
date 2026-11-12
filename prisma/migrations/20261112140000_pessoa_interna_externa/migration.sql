-- Um cadastro por pessoa: o contato externo pode apontar para a conta do sistema
-- da mesma pessoa, e o externo ganha no projeto os mesmos dados do membro.
ALTER TABLE "Stakeholder" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Stakeholder_userId_key" ON "Stakeholder"("userId");
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectStakeholder" ADD COLUMN "remuneracao" DOUBLE PRECISION;
ALTER TABLE "ProjectStakeholder" ADD COLUMN "horasDiarias" DOUBLE PRECISION;
ALTER TABLE "ProjectStakeholder" ADD COLUMN "funcoes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProjectStakeholder" ADD COLUMN "departamentos" TEXT[] DEFAULT ARRAY[]::TEXT[];
