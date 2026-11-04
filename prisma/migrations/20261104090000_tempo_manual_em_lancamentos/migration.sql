-- Transfere o tempo legado na mesma instrução que remove o valor da EAP.
-- Sem card válido ou autor identificável, o valor permanece na origem.
WITH candidatos AS (
  SELECT
    n.id AS node_id,
    c.id AS card_id,
    autor.id AS user_id,
    n."updatedAt" AS fim,
    (n.properties->>'tempoRealMinutos')::numeric AS minutos
  FROM "WbsNode" n
  JOIN "Card" c ON c.id = n.properties->>'cardId' AND c."deletedAt" IS NULL
  LEFT JOIN "Sprint" s ON s.id = c."sprintId"
  JOIN LATERAL (
    SELECT u.id
    FROM "User" u
    WHERE u."tenantId" = n."tenantId" AND u."deletedAt" IS NULL
      AND (
        u.id = n.properties->>'elaboradoPorUserId'
        OR (n.properties->'elaboradoPorUserIds') ? u.id
        OR EXISTS (
          SELECT 1 FROM "CardResponsible" r WHERE r."cardId" = c.id AND r."userId" = u.id
        )
      )
    ORDER BY
      CASE
        WHEN u.id = n.properties->>'elaboradoPorUserId' THEN 0
        WHEN (n.properties->'elaboradoPorUserIds') ? u.id THEN 1
        ELSE 2
      END,
      u.id
    LIMIT 1
  ) autor ON true
  WHERE (c."projectId" = n."projectId" OR (c."projectId" IS NULL AND s."projectId" = n."projectId"))
    AND jsonb_typeof(n.properties->'tempoRealMinutos') = 'number'
  FOR UPDATE OF n
), lancamentos AS (
  INSERT INTO "TimeEntry" (
    id, "userId", "cardId", "startedAt", "endedAt", duration,
    description, "isRunning", "isManual", "createdAt", "updatedAt"
  )
  SELECT
    'c' || substr(md5('tempo-manual-planilha:' || node_id), 1, 24),
    user_id, card_id, fim - (minutos * 60) * interval '1 second', fim, round(minutos * 60)::integer,
    'Migrado do tempo manual da planilha', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM candidatos
  WHERE round(minutos * 60) BETWEEN 1 AND 2147483647
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
UPDATE "WbsNode" n
SET properties = n.properties - 'tempoRealMinutos',
    version = n.version + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM candidatos
JOIN lancamentos ON lancamentos.id = 'c' || substr(md5('tempo-manual-planilha:' || candidatos.node_id), 1, 24)
WHERE n.id = candidatos.node_id;
