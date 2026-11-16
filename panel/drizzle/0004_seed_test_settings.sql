-- Passe de reconexão: padrão de produção, 900 s (15 min). Editável no painel (Configurações).
-- (Em instalações antigas esta migração gravava 60 s, valor de teste; o arquivo mantém o nome original
-- porque o histórico de migrações já aplicadas o referencia.)
INSERT INTO "app_settings" ("key", "value") VALUES ('reconnect_pass_seconds', '900'::jsonb)
ON CONFLICT ("key") DO NOTHING;
