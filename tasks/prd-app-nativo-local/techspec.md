# Especificação Técnica — Aplicativo nativo local

## Resumo Executivo

O aplicativo é este repositório, em `/home/psgvaz/Projetos/app-english-mobile`, clone do Expo de `sce-integrador`. As rotas ficam em `src/app`, com Expo SDK 58, Expo Router, NativeWind e `expo-sqlite` já instalados. As regras de estudo são copiadas uma vez de `app-english` para `src/lib` e para a semente. O repositório `app-english` não é alterado e não entra no bundle.

A persistência é um arquivo SQLite aberto por `expo-sqlite`. A migração 1 cria o schema equivalente ao Prisma atual. Um adapter implementa `DailyReviewReader.summary` com as mesmas três consultas do reader Prisma. O fuso vem de `expo-localization` e, se for inválido, cai em `America/Sao_Paulo`. Não há servidor nem endpoint.

## Arquitetura do Sistema

### Visão Geral dos Componentes

- Raiz deste repositório: telas em `src/app`, composição, banco, semente e fuso em `src/`. A regra de estudo vem da cópia, sem ser reescrita.
- `src/lib/domain/learning/local-day.ts`: dia local e validação de fuso, copiado sem alterar a regra.
- `src/lib/application/review/get-daily-review-summary.ts`: caso de uso da entrada, copiado.
- `src/lib/presentation/review/home-review-copy.ts`: transforma o resumo em texto, copiado.
- `prisma/seed-data.ts` e `normalizeVocabularyText`: vocabulário inicial, copiados. A semente do celular só insere o que falta.
- `SqliteDatabase`: abre `english.db`, liga `foreign_keys` e `WAL`, aplica a migração dentro de `withTransactionAsync`.
- `SqliteDailyReviewReader`: implementa o resumo sobre o schema novo.
- `SqliteVisitorPreferences`: lê e grava o fuso do aluno.
- `LocalLearner`: garante uma única linha em `AnonymousVisitor`.
- `HomeComposition`: ordena migração, aluno, semente, fuso e caso de uso.
- Telas Expo Router: entrada e quatro destinos que anunciam atividade indisponível.

Fluxo: a tela pede o resumo à composição. A composição lê o fuso do aparelho, grava se mudou, executa `GetDailyReviewSummary` e devolve a view pronta. Fechar o aplicativo não fecha o arquivo de forma destrutiva. A abertura seguinte reutiliza o mesmo arquivo, o mesmo aluno e as mesmas palavras.

A cópia traz arquivos concretos de domínio, aplicação e `home-review-copy.ts` para `src/lib`, onde o alias `@/` já aponta. Não traz `lib/infrastructure`, Prisma, cookie nem páginas do Next. `app-english` fica só como origem dessa cópia.

## Design de Implementação

### Interfaces Principais

O caso de uso e as portas atuais não ganham método novo. O adapter do celular implementa as portas existentes.

```ts
interface HomeComposition {
  load(now?: Date): Promise<HomeReviewSummaryView>;
}

interface LearnerStore {
  ensure(): Promise<{ visitorId: string }>;
}
```

`HomeComposition.load` é a única entrada da tela. `LearnerStore.ensure` insere o aluno quando a tabela está vazia e devolve o mais antigo quando já existe linha. `SqliteDailyReviewReader.summary` reproduz a conta do reader Prisma: vencidas com `nextReviewAt <= now`, novas sem progresso, cota `DAILY_NEW_WORD_LIMIT` menos palavras de origem `NEW` na data local, e a próxima revisão futura. Os outros métodos da porta lançam erro explícito até o PRD da revisão. `VisitorPreferences` continua com `getTimeZone` e `saveTimeZone`.

O relógio da composição é `() => new Date()`. O fuso do aparelho é `getCalendars()[0].timeZone`, relido quando o app volta ao primeiro plano. Valor nulo ou rejeitado por `isValidTimeZone` usa o fuso já gravado e, na ausência dele, `DEFAULT_TIME_ZONE`.

### Modelos de Dados

A migração 1 traduz o `schema.prisma` atual para SQL, com `PRAGMA user_version = 1` na mesma transação das tabelas. Identificadores são `TEXT`. Instants são `TEXT` ISO-8601. Booleanos são `INTEGER`. As tabelas e as chaves únicas acompanham os models: `AnonymousVisitor`, `Word`, `GameSession`, `GameSessionWord`, `GameAnswer`, `LearnerWordProgress`, `ChallengeSession`, `ChallengeSessionWord`, `ChallengeAttempt`, `ReviewSession`, `ReviewSessionWord` e `TypingAttempt`.

Índices que a entrada usa: `LearnerWordProgress (visitorId, nextReviewAt)`, `Word (active)`, unicidade de `(englishNormalized, portugueseNormalized)` e `ReviewSession (visitorId, localDate)`. As chaves estrangeiras e os `ON DELETE` do Prisma permanecem. A semente insere as 32 entradas de `vocabularySeed` só quando o par normalizado não existe. Não atualiza texto de linha já presente, para uma edição futura sobreviver à reabertura.

### Endpoints de API

Não há endpoints. A tela chama `HomeComposition.load` no processo do aplicativo. Nenhuma URL, cookie ou cabeçalho faz parte desta entrega.

## Pontos de Integração

- SQLite local, arquivo `english.db` no diretório padrão do `expo-sqlite`. Falha de migração interrompe a entrada e oferece tentar de novo. O arquivo não é apagado para contornar erro.
- Fuso do aparelho via `expo-localization`. Falha ou fuso inválido usa o fallback do domínio. O estudo segue.
- Identificador do aluno via `expo-crypto` `randomUUID`.
- Voz do aparelho fica para as atividades seguintes. Esta entrega não chama síntese de fala.
- Não há autenticação, rede nem serviço externo.

## Abordagem de Testes

A ordem é TDD: teste que falha, implementação mínima, refatoração. O Vitest atual do domínio permanece. Não se reescreve `local-day` nem `GetDailyReviewSummary` para fazer o teste passar.

### Testes Unidade

- Fuso do aparelho: valor IANA válido é aceito; `null` e valor rejeitado por `isValidTimeZone` caem no fuso gravado e, sem gravação, em `America/Sao_Paulo`.
- Semente: a segunda execução não duplica par normalizado e não altera texto já inserido.
- Aluno: a segunda abertura devolve o mesmo id. O mock é só o gerador de id e o relógio.

### Testes de Integração

As consultas e a migração recebem um executor mínimo (`exec`, `getAll`, `run`). No aplicativo ele delega ao `expo-sqlite`. No Vitest, o mesmo executor usa `better-sqlite3`, abrindo o mesmo arquivo duas vezes para simular reabrir o app.

Cenários: schema na versão 1 com as doze tabelas; primeira carga com 32 palavras, zero vencidas e no máximo 10 novas; segunda carga com o mesmo aluno e as mesmas 32 palavras; uma linha vencida aumenta `dueCount`; uma palavra de origem `NEW` na data local reduz `newAvailable`; catálogo de 5.000 palavras ativas devolve o resumo sem carregar todas as linhas para o JavaScript.

### Testes de E2E

Playwright não entra nesta entrega. Não existe servidor para o teste atravessar, e o escopo escolhido não inclui teste de interface. O ciclo abrir, gravar e abrir de novo fica no teste de integração do mesmo arquivo SQLite.

## Sequenciamento de Desenvolvimento

### Ordem de Construção

1. Executor SQL e migração 1, com o teste de schema falhando antes. O restante depende das tabelas.
2. Aluno único e semente idempotente. Sem isso a entrada duplicaria dados.
3. Fuso e `SqliteVisitorPreferences`.
4. `SqliteDailyReviewReader.summary` e o teste das contagens, inclusive 5.000 palavras.
5. `HomeComposition` ligando o caso de uso e `toHomeReviewSummaryView`.
6. App Expo, Metro apontando para `@/`, entrada e quatro rotas de destino.
7. Conferir que o bundle não importa Prisma nem `next`.

### Dependências Técnicas

Expo SDK 58, Expo Router e `expo-sqlite` já estão neste repositório. Instalar com `npx expo install` o que falta: `expo-localization` e `expo-crypto`. O SQLite padrão do Expo Go basta. Não há serviço externo bloqueante, e o site não precisa estar no ar.

## Monitoramento e Observabilidade

O repositório não tem Prometheus nem Grafana. Esta entrega não cria métrica remota nem envia log para fora do aparelho.

Falha de migração, semente ou resumo registra uma linha local com o evento `home.migration_failed`, `home.seed_failed` ou `home.summary_failed`. A tela mostra estado de erro com ação de tentar outra vez. Sucesso da entrada não gera log.

## Considerações Técnicas

### Decisões Principais

As regras entram por uma cópia única de `app-english` para `src/lib`. Os repositórios não se importam no build. A partir da cópia, a regra mora neste projeto, e `app-english` deixa de ser editado.

O schema completo entra na versão 1. As próximas partes acrescentam repositórios e só sobem `user_version` quando o SQL mudar. Drizzle e Prisma no aparelho foram rejeitados: o schema já está escrito, e o cliente Prisma não roda no React Native.

A semente não faz upsert com atualização. O upsert do site reescreve texto a cada deploy. No telefone, reescrever apagaria correção do aluno.

O fuso do aparelho prevalece sobre o valor gravado quando é válido. A agenda segue o dia local, como `local-day.ts` já define.

As consultas do resumo ficam num executor compartilhado entre `expo-sqlite` e `better-sqlite3`. Assim o Vitest cobre o SQL sem subir o Metro.

A interface desta parte usa os primitivos do React Native. Tailwind 4 do site não entra no celular.

### Riscos Conhecidos

Copiar um barrel da infraestrutura do site puxaria Prisma para o bundle. A mitigação é copiar arquivo a arquivo de domínio e aplicação, e falhar o teste se o bundle resolver `@prisma/client` ou `next`.

Hermes precisa resolver o fuso IANA em `Intl.DateTimeFormat`, porque `local-day.ts` depende disso. Fuso não suportado cai no fallback. Vale um teste com `America/Sao_Paulo`.

Depois que um aparelho estiver na versão 1, a migração não pode ser editada no lugar. Mudança de coluna é versão 2, na mesma transação do incremento.

Corrigir uma frase da semente não alcança instalação que já inseriu a palavra. A correção fica para a edição de vocabulário.

No Android, o fuso pode mudar com o app aberto. Reler em `AppState` `active` cobre a volta ao primeiro plano.

### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica, e não há desvio a registrar. A restrição observada é a do próprio código: `lib/domain` e `lib/application` continuam sem Expo, Prisma, React Native e Next.

### Arquivos relevantes e dependentes

Novos ou substituídos neste repositório: `src/app/index.tsx`, `src/app/revisar.tsx`, `src/app/treino-livre.tsx`, `src/app/desafio.tsx`, `src/app/palavras.tsx`, `src/persistence/migrate.ts`, `src/persistence/sqlite-daily-review-reader.ts`, `src/persistence/sqlite-visitor-preferences.ts`, `src/identity/local-learner.ts`, `src/time/device-time-zone.ts`, `src/composition/home.ts`, `src/seed/seed-vocabulary.ts`, `tests/integration/persistence/sqlite-daily-summary.test.ts`. O esqueleto Expo (`package.json`, `app.json`, `metro.config.js`, `src/app/_layout.tsx`) já existe no clone.

Copiados sem mudança de regra, a partir de `app-english`: `src/lib/domain/learning/local-day.ts`, `src/lib/application/review/get-daily-review-summary.ts`, `src/lib/application/review/ports/daily-review-reader.ts`, `src/lib/application/review/ports/visitor-preferences.ts`, `src/lib/presentation/review/home-review-copy.ts`, `prisma/schema.prisma` como referência do SQL e `prisma/seed-data.ts`.

Fora deste repositório: o `app-english` inteiro. Nada lá é editado, inclusive a infraestrutura Prisma, o cookie do visitante e o site Next.
