# Tarefa 1.0: Repositório pronto com as regras de estudo

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Deixar `app-english-mobile` instalável e com as regras de estudo disponíveis para as tasks seguintes. As regras são copiadas uma vez de `app-english`. Aquele repositório não é editado. O site e o Prisma não entram neste projeto.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Instalar as dependências do clone e acrescentar `expo-localization` e `expo-crypto` com `npx expo install`.
- Copiar para `src/lib` somente domínio, aplicação do resumo e o texto da entrada. Copiar a semente e o `schema.prisma` como referência do SQL.
- Não copiar `lib/infrastructure`, páginas do Next nem o cookie do visitante.
- O alias `@/` continua apontando para `src/*`.
- Um teste falha se o código copiado resolver `@prisma/client` ou `next`.
</requirements>

## Subtarefas

- [x] 1.1 Escrever o teste que falha quando `src/lib` importa `@prisma/client` ou `next`.
- [x] 1.2 Instalar dependências e os dois pacotes Expo que faltam.
- [x] 1.3 Copiar os arquivos listados na techspec, ajustando só o que for necessário para o alias `@/`.
- [x] 1.4 Rodar os testes de unidade já existentes de dia local e do caso de uso do resumo, agora dentro deste repositório.
- [x] 1.5 Refatorar imports até o teste da subtarefa 1.1 passar sem alterar regra de estudo.

## Detalhes de Implementação

Ver `techspec.md`: Resumo Executivo, Visão Geral dos Componentes, Decisões Principais e Arquivos relevantes e dependentes.

A origem da cópia é `/home/psgvaz/Projetos/app-english`. Nada é commitado nem editado lá.

## Critérios de Sucesso

- `npm install` termina e o TypeScript do código copiado compila.
- `expo-router` e `expo-sqlite` permanecem. `expo-localization` e `expo-crypto` passam a constar no `package.json`.
- Nenhum arquivo em `src/lib` importa `@prisma/client` ou `next`.
- Os testes de `local-day` e de `GetDailyReviewSummary` passam com o mesmo comportamento do site.

## Testes da Tarefa

- [x] Testes de unidade: dia local e caso de uso do resumo, trazidos com a cópia e executados no Vitest deste repositório.
- [x] Testes de integração: varredura do grafo de `src/lib` rejeita `@prisma/client` e `next`.
- [ ] Testes E2E: não se aplicam. Esta task não abre tela.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `package.json`
- `tsconfig.json`
- `src/lib/domain/**`
- `src/lib/application/review/get-daily-review-summary.ts`
- `src/lib/application/review/ports/daily-review-reader.ts`
- `src/lib/application/review/ports/visitor-preferences.ts`
- `src/lib/presentation/review/home-review-copy.ts`
- `prisma/schema.prisma`
- `prisma/seed-data.ts`
- Teste novo de fronteira do grafo em `tests/`
