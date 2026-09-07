/**
 * verifyTaskerToken
 * -------------------
 * Autenticação simples por token partilhado (Bearer), lido de
 * TASKER_API_KEY. Cada dispositivo Tasker usa a mesma credencial nesta
 * fase (um único revendedor) — a Fase 8 troca por uma credencial própria
 * por dispositivo/tenant, sem mudar a forma como esta função é chamada.
 */
export function verifyTaskerToken(authorizationHeader, expectedToken) {
  if (!expectedToken) return false; // nunca aceitar se não houver token configurado
  if (!authorizationHeader) return false;

  // trim() + split em qualquer sequência de espaços/quebras de linha —
  // apps de automação em Android (MacroDroid, Tasker) por vezes introduzem
  // espaço extra ou quebra de linha ao colar um valor no campo de cabeçalho.
  // Um split(' ') simples partia mal nesses casos e rejeitava um token
  // correto — bug real encontrado a testar com um dispositivo real.
  const [scheme, token] = authorizationHeader.trim().split(/\s+/);
  if (scheme !== 'Bearer' || !token) return false;

  return token === expectedToken.trim();
}
