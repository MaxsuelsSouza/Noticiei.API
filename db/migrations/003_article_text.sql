-- Evolução 2: texto limpo do artigo, extraído no idioma original, para leitura e voz no app.
-- article = lista de blocos [{"type": "heading" | "paragraph" | "code", "text": "..."}].

alter table contents
  add column article           jsonb,
  add column text_status       text not null default 'pendente'
                               check (text_status in ('pendente', 'ok', 'falhou', 'bloqueado', 'expirado')),
  add column text_error        text,
  add column text_extracted_at timestamptz,
  add column reading_minutes   int;
