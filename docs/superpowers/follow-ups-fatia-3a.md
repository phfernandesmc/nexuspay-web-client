# Follow-ups da Fatia 3a

## Precisa sair antes da Fatia 4 (deploy)

### `VITE_API_URL` e a origem do CORS estão presas ao desenvolvimento

O cliente aponta para `http://localhost:8000` e o gateway libera
`http://localhost:5173`. No deploy os dois viram outra coisa, e o
`strictPort` deixa de fazer sentido. Ajustar junto com a configuração de
deploy, dos dois lados.

## Dívida conhecida

### O catálogo de erro não se atualiza sozinho

`CODIGOS_DE_ERRO` em `src/lib/errors.ts` é mantido à mão. O teste pega
tradução faltando, não código novo no gateway. Um contrato executável entre
os repositórios — gerar a lista a partir do OpenAPI, por exemplo — resolveria,
mas os códigos não estão no schema hoje.

### Sem tema escuro

O shadcn já instala as variáveis; falta o alternador e a preferência
persistida. Não é requisito desta fatia.

## Fora de escopo, mas alguém vai perguntar

- **Recuperação de senha.** Não existe rota no gateway.
- **Lembrar-me / sessão longa.** O refresh dura 7 dias e é o que há.
