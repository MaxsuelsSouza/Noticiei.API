-- Lista de compras: o que é anotado no mercado (escaneando o código de barras ou digitando) e a conferência
-- com a NFC-e da Sefaz. Valores em centavos; quantidade e preço unitário em numeric (peso em kg tem 3 casas).

-- Catálogo: um produto é uma embalagem específica (Arroz Urbano 1 kg e Arroz Kaldinho 1 kg são dois produtos).
create table compras_produtos (
  id          bigserial primary key,
  nome        text not null check (length(nome) between 1 and 120),
  unidade     text not null default 'UN' check (unidade in ('UN', 'KG')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index compras_produtos_nome on compras_produtos (lower(nome));

-- Códigos que apontam para um produto:
--   ean  = código de barras da embalagem (vale em qualquer mercado; cnpj = '')
--   loja = código interno que a Sefaz mostra na nota ("Código: 15063"), que só vale naquele CNPJ
create table compras_codigos (
  tipo        text not null check (tipo in ('ean', 'loja')),
  cnpj        text not null default '' check (cnpj = '' or cnpj ~ '^\d{14}$'),
  codigo      text not null check (length(codigo) between 1 and 40),
  produto_id  bigint not null references compras_produtos (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tipo, cnpj, codigo),
  check ((tipo = 'ean') = (cnpj = ''))
);

create index compras_codigos_produto on compras_codigos (produto_id);

-- NFC-e importada. A chave de acesso é única: a mesma nota não entra duas vezes.
create table compras_notas (
  chave               text primary key check (chave ~ '^\d{44}$'),
  cnpj                text not null,
  estabelecimento     text,
  numero              text not null,
  serie               text not null,
  emitida_em          timestamptz,
  subtotal_centavos   int not null,
  descontos_centavos  int,           -- null: a fonte (texto colado) não informou
  total_centavos      int,           -- "Valor a pagar"
  origem              text not null check (origem in ('xml', 'html', 'texto')),
  bruto               text,          -- conteúdo recebido, para refazer a leitura se o layout mudar
  created_at          timestamptz not null default now()
);

create table compras_itens_nota (
  id                     bigserial primary key,
  chave                  text not null references compras_notas (chave) on delete cascade,
  ordem                  int not null,
  codigo_loja            text,
  ean                    text,
  descricao              text not null,
  quantidade             numeric(12, 4) not null,
  unidade                text not null,
  preco_unitario         numeric(14, 4) not null,
  valor_centavos         int not null,
  desconto_centavos      int not null default 0,
  unique (chave, ordem)
);

-- Uma ida ao mercado.
create table compras_sessoes (
  id                        bigserial primary key,
  nome                      text,
  orcamento_centavos        int check (orcamento_centavos > 0),
  desconto_manual_centavos  int check (desconto_manual_centavos >= 0),
  chave                     text references compras_notas (chave) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- O que foi anotado na sessão. produto_id fica nulo para o que foi só digitado e ainda não foi ligado ao catálogo.
create table compras_itens (
  id               bigserial primary key,
  sessao_id        bigint not null references compras_sessoes (id) on delete cascade,
  produto_id       bigint references compras_produtos (id) on delete set null,
  descricao        text not null check (length(descricao) between 1 and 120),
  texto_original   text,
  codigo_lido      text,
  quantidade       numeric(12, 4) not null check (quantidade > 0),
  unidade          text not null default 'UN' check (unidade in ('UN', 'KG')),
  preco_unitario   numeric(14, 4) not null check (preco_unitario >= 0),
  valor_centavos   int not null check (valor_centavos >= 0),
  em_promocao      boolean not null default false,
  created_at       timestamptz not null default now()
);

create index compras_itens_sessao on compras_itens (sessao_id, id);
