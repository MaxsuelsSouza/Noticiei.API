-- Preço anterior do produto naquele mercado no momento em que o item foi anotado: o carrinho mostra "+R$ 0,30"
-- no item que subiu (e "−" no que baixou) sem precisar recalcular.
alter table compras_itens add column preco_anterior numeric(14, 4);
