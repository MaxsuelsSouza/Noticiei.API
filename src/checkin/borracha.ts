/**
 * Cliente do site da academia (professorborracha.com.br / "Agenda Borracha").
 *
 * ⚠️ AINDA NÃO IMPLEMENTADO: falta saber como o site faz login e check-in por dentro.
 * Para preencher, capture no navegador (DevTools ou Eruda → aba Network) as duas requisições:
 *   1. a do botão "Entrar" (login de aluno);
 *   2. a do check-in.
 * Para cada uma: URL, método, headers relevantes (Content-Type, Cookie/Authorization, Next-Action se houver)
 * e o corpo. Troque a senha e os tokens por XXX antes de compartilhar.
 *
 * O resto do fluxo (endpoint, autenticação, um check-in por dia, histórico) já funciona sem depender daqui.
 */
import { env } from "../env.js";

const BASE_URL = "https://www.professorborracha.com.br";

export class GymSiteNotConfigured extends Error {
  constructor() {
    super("cliente do site da academia ainda não implementado (falta capturar a requisição de check-in)");
  }
}

export interface GymSite {
  /** Faz login e o check-in. Devolve um resumo da resposta do site para guardar no histórico. */
  checkIn(): Promise<{ detail: string }>;
}

export const borracha: GymSite = {
  async checkIn() {
    const { email, password } = env.borracha;
    void email;
    void password;
    void BASE_URL;

    // Esboço do que vai entrar aqui quando a requisição for capturada:
    //
    //   const login = await fetch(`${BASE_URL}/<rota de login>`, {
    //     method: "POST",
    //     headers: { "content-type": "application/json" },
    //     body: JSON.stringify({ email, senha: password }),
    //     redirect: "manual",
    //   });
    //   const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    //
    //   const res = await fetch(`${BASE_URL}/<rota de check-in>`, { method: "POST", headers: { cookie } });
    //   if (!res.ok) throw new Error(`check-in falhou: HTTP ${res.status}`);
    //   return { detail: (await res.text()).slice(0, 500) };

    throw new GymSiteNotConfigured();
  },
};
