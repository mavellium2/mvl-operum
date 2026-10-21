-- Termo e turno do projeto (card "Projeto: exibir campo termo/turno quando o
-- período não for anual"). Anuláveis: projetos existentes ficam sem valor e os
-- documentos mantêm o texto "A definir" até o gerente preencher.
ALTER TABLE "Project" ADD COLUMN "termo" TEXT;
ALTER TABLE "Project" ADD COLUMN "turno" TEXT;
