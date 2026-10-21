-- Cor da coluna da sprint (card "Sprint: permitir trocar a cor das colunas").
-- Anulável: colunas existentes continuam com a aparência padrão (sem cor).
ALTER TABLE "SprintColumn" ADD COLUMN "color" TEXT;
