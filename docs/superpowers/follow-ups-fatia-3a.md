# Follow-ups da Fatia 3a

## Precisa sair antes da Fatia 4 (deploy)

### `VITE_API_URL` e a origem do CORS estão presas ao desenvolvimento

O cliente aponta para `http://localhost:8000` e o gateway libera
`http://localhost:5173`. No deploy os dois viram outra coisa, e o
`strictPort` deixa de fazer sentido. Ajustar junto com a configuração de
deploy, dos dois lados.

## Cobertura ausente (declarada, não coberta)

### O caminho 3 do spec: renovação por 401 no meio da sessão

O spec pede três caminhos no Playwright, e o terceiro — *"um refresh de
verdade, com token realmente expirado"* — não existe. O que há é
`recarregar restaura a sessao pelo refresh do BOOT`, que exercita o refresh
disparado na **carga da página**, não a renovação disparada por um `401`
`TOKEN_EXPIRED` no meio da sessão. São mecanismos diferentes: o do boot é o
`renovarNoBoot` de `features/auth/api.ts`; o outro é o interceptor de
resposta de `lib/http.ts`, com a fila única, a marca de já-repetida e a
repetição da requisição original.

O que faltaria: subir o gateway de teste com `ACCESS_TOKEN_EXPIRE_MINUTES`
reduzido (o spec sugere isso justamente para não esperar quinze minutos),
autenticar, esperar o token expirar, disparar uma requisição autenticada e
verificar que a tela continua funcionando sem passar pelo login. Precisa de
uma configuração de gateway separada da de desenvolvimento — é trabalho de
ambiente, não de teste.

Com MSW isso está coberto (`src/lib/http.test.ts`), e é o que dá a
confiança de hoje. O que falta é a prova contra o gateway real, que é
exatamente onde contrato quebrado aparece.

### A trava entre abas não é provada com duas abas de verdade

`comTrava` (`src/lib/locks.ts`) serializa `/auth/refresh` entre abas pela Web
Locks API. O jsdom **não implementa** a API, então os testes de Vitest cobrem
o caminho de ausência (que precisa continuar funcionando), o nome da trava
nas duas entradas de refresh, e a serialização contra um dublê — não a
coordenação real entre dois contextos de navegação.

O que faltaria: um teste de Playwright com dois `context`/`page` na mesma
origem, ambos carregando o app ao mesmo tempo com o mesmo cookie de refresh,
verificando que as duas abas continuam autenticadas. Contra o gateway real
ele seria decisivo — sem a trava, a segunda aba apresenta um token já
rotacionado e o gateway revoga **todas** as sessões.

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
