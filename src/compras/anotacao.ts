import { numeroBr, valorLinha } from "./numeros.js";

/**
 * Texto livre ditado ou digitado no mercado, no formato {quantidade} {produto} {preço}:
 *   "2 arroz 4,13" · "6 sabonetes 1,90 cada" · "Escova de dente 14,90"
 *   "Macaxeira 2,178kg o ela esta 4,00 por kg" · "523 gramas banana da terra esta 6,99 o kg"
 *   "300g presunto 3,99 o 100g" · "250 gramas castanha 0,08 a grama" (o preço vira o do kg)
 * O preço é o de uma unidade, de 1 kg, de 100 g ou de 1 g; quantidade ausente vale 1.
 */
export interface AnotacaoLida {
  descricao: string;
  quantidade: number;
  unidade: "UN" | "KG";
  precoUnitario: number;
  valorCentavos: number;
}

const LIGACAO = new Set(["o", "a", "os", "as", "esta", "está", "ta", "tá", "ela", "ele", "cada", "por", "r$", "reais", "custa", "un", "und", "unidade", "unidades"]);
const NUM = String.raw`\d+(?:[.,]\d+)?`;

/** Plural simples do português: sabonetes → sabonete, papéis fica. Só a palavra principal (a primeira). */
function singular(palavra: string): string {
  if (palavra.length <= 3 || !/s$/i.test(palavra) || /ss$/i.test(palavra)) return palavra;
  if (/[õã]es$/i.test(palavra)) return palavra.replace(/[õã]es$/i, "ão");
  return palavra.slice(0, -1);
}

export function lerAnotacao(entrada: string): AnotacaoLida {
  let t = ` ${entrada.trim().replace(/\s+/g, " ")} `;
  if (!t.trim()) throw new Error("texto vazio");

  // Preço por 100 g ou por grama (frios, doces a granel): "3,99 o 100g", "3,99/100g", "0,05 a grama".
  // Vem antes do peso, senão o "100g" seria lido como peso. Guardado como preço do kg.
  let fatorPreco = 1;
  t = t.replace(/\s(?:o|os|a|por|cada|\/)\s?100\s?(?:g|gr|gramas?)(?=\s)|\/100\s?(?:g|gr)(?=\s)/i, () => {
    fatorPreco = 10;
    return " ";
  });
  t = t.replace(/\s(?:o|a|por|cada|\/)\s?(?:grama|g)(?=\s)/i, () => {
    fatorPreco = 1000;
    return " ";
  });

  // Peso: "2,178kg", "2,178 kg", "523 gramas", "523g".
  let pesoKg: number | null = null;
  t = t.replace(new RegExp(String.raw`\s(${NUM})\s?(kg|quilos?|kilos?|gramas?|g)(?=\s)`, "i"), (_, n: string, u: string) => {
    pesoKg = /^g/i.test(u) ? numeroBr(n) / 1000 : numeroBr(n);
    return " ";
  });

  // Preço por kg: "6,99 o kg", "4,00 por kg", "6,99/kg", "o kg 6,99".
  let porKg = false;
  t = t.replace(/\s(?:o|por|\/)\s?(?:kg|quilo|kilo)(?=\s)|\/kg(?=\s)/i, () => {
    porKg = true;
    return " ";
  });

  const numeros = [...t.matchAll(new RegExp(String.raw`(?<=\s)(?:R\$\s?)?(${NUM})(?=\s)`, "gi"))];
  if (!numeros.length) throw new Error("não achei o preço (ex.: 2 arroz 4,13)");
  const ultimo = numeros[numeros.length - 1]!;
  const preco = Math.round(numeroBr(ultimo[1]!) * fatorPreco * 10000) / 10000;
  let quantidade = 1;
  let resto = t.slice(0, ultimo.index) + " " + t.slice(ultimo.index! + ultimo[0].length);
  if (numeros.length > 1) {
    const primeiro = numeros[0]!;
    quantidade = numeroBr(primeiro[1]!);
    resto = t.slice(0, primeiro.index) + " " + t.slice(primeiro.index! + primeiro[0].length, ultimo.index) + " " + t.slice(ultimo.index! + ultimo[0].length);
  }

  // "de/da/do" ficam no meio do nome (escova de dente, banana da terra), mas saem das pontas.
  const palavras = resto.split(/\s+/).filter((p) => p && !LIGACAO.has(p.toLowerCase()));
  while (palavras.length && /^(de|da|do|e)$/i.test(palavras.at(-1)!)) palavras.pop();
  while (palavras.length && /^(de|da|do|e)$/i.test(palavras[0]!)) palavras.shift();
  if (!palavras.length) throw new Error("não achei o nome do produto");
  palavras[0] = singular(palavras[0]!);
  const descricao = palavras.join(" ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

  const peso: number | null = pesoKg;
  const unidade = peso !== null || porKg || fatorPreco > 1 ? "KG" : "UN";
  if (unidade === "KG" && peso === null && numeros.length < 2) throw new Error("faltou o peso (ex.: 1,5kg batata 6,49 o kg)");
  const qtd = peso ?? quantidade;
  if (!(qtd > 0)) throw new Error("quantidade deve ser maior que zero");
  return { descricao, quantidade: qtd, unidade, precoUnitario: preco, valorCentavos: valorLinha(qtd, preco) };
}
