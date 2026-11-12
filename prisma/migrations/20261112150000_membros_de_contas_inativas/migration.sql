-- Contas desativadas antes da regra "inativar a conta inativa a pessoa em todos os
-- projetos" ficaram com vínculos ativos. Passam a inativas com o motivo padrão, para
-- aparecerem em vermelho e os cards abertos delas pedirem outro responsável.
-- Só mexe em vínculos ativos de contas inativas e não excluídas; o resto fica igual.
UPDATE "UserProject" up
SET "active" = false,
    "inactiveReason" = 'Conta inativada no sistema',
    "inactivatedAt" = COALESCE(up."inactivatedAt", now()),
    "endDate" = COALESCE(up."endDate", now())
FROM "User" u
WHERE up."userId" = u."id"
  AND up."active" = true
  AND u."isActive" = false
  AND u."deletedAt" IS NULL;
