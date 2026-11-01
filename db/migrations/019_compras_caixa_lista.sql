-- Modo caixa: enquanto o caixa passa os itens em promoção, você marca se veio com desconto (ok) ou não (errado).
alter table compras_itens add column conferido_caixa text check (conferido_caixa in ('ok', 'errado'));

-- "Comprar de novo": lista da compra, copiada de uma compra anterior e editável. Um item planejado é marcado quando
-- um item anotado na compra bate com ele (mesmo produto ou nome parecido), ou à mão.
create table compras_planejados (
  id          bigserial primary key,
  sessao_id   bigint not null references compras_sessoes (id) on delete cascade,
  produto_id  bigint references compras_produtos (id) on delete set null,
  descricao   text not null check (length(descricao) between 1 and 120),
  quantidade  numeric(12, 4) not null default 1 check (quantidade > 0),
  unidade     text not null default 'UN' check (unidade in ('UN', 'KG')),
  item_id     bigint references compras_itens (id) on delete set null,
  marcado     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index compras_planejados_sessao on compras_planejados (sessao_id, id);
