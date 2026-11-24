-- Avaliação de R.H.: número de rodadas abertas por projeto (mínimo 2: AC e AF; o gerente adiciona as seguintes).
ALTER TABLE "Project" ADD COLUMN "avaliacaoRhRodadas" INTEGER NOT NULL DEFAULT 2;
