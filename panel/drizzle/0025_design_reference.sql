-- Design de referência: o fundo das páginas de entrada (vídeo "faiscas" com os ajustes de cada tema).
-- O padrão do código é "sem fundo"; sem esta linha, uma instalação nova sairia com a entrada diferente da de referência.
-- ON CONFLICT DO NOTHING: instalações que já têm o valor (inclusive a de referência) não mudam, e o cliente continua livre para
-- trocar ou desligar o fundo em Personalização.
INSERT INTO "app_settings" ("key", "value") VALUES (
  'entry_bg',
  '{"mode":"video","auto":true,"respectMotion":true,"videoPreset":"faiscas","imagePreset":"degrade","dark":{"hue":180,"posX":30,"blend":"screen","invert":false,"opacity":100,"contrast":100,"saturate":100,"brightness":112},"light":{"hue":0,"posX":30,"blend":"multiply","invert":true,"opacity":100,"contrast":150,"saturate":100,"brightness":92}}'::jsonb
)
ON CONFLICT ("key") DO NOTHING;
