# Review: Task 3.0 - Aluno único e vocabulário inicial

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 3_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

A primeira abertura passa a gravar um único aluno e as 32 palavras iniciais. A abertura seguinte devolve o mesmo aluno, não duplica o vocabulário e não reescreve inglês, português nem frase já gravados. A migração 1 não foi editada. O resumo do dia não é calculado.

O repositório ainda não tem commits, então não há diff contra uma base. A revisão cobriu os arquivos desta task, sem desfazer o schema, o executor e os testes das tasks 1 e 2.

Não há problema crítico nem major. Os dois pontos abaixo são observações de teste e não mudam o comportamento.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/identity/local-learner.ts` | ✅ OK | 0 |
| `src/seed/seed-vocabulary.ts` | ✅ OK | 0 |
| `src/persistence/bootstrap-english-database.ts` | ✅ OK | 0 |
| `src/persistence/open-english-database.ts` | ✅ OK | 0 |
| `tests/support/better-sqlite-executor.ts` | ✅ OK | 0 |
| `tests/unit/identity/local-learner.test.ts` | ⚠️ Problemas | 1 |
| `tests/unit/seed/seed-vocabulary.test.ts` | ⚠️ Problemas | 1 |
| `tests/integration/persistence/local-vocabulary.test.ts` | ✅ OK | 0 |
| `tests/unit/persistence/newer-schema-version.test.ts` | ⚠️ Problemas | 1 |
| `prisma/seed-data.ts` | ✅ OK | 0 |
| `src/persistence/migrate.ts` | ✅ OK | 0 |
| `src/persistence/schema-version-one.ts` | ✅ OK | 0 |

`prisma/seed-data.ts`, `migrate.ts` e `schema-version-one.ts` foram lidos e não foram alterados.

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. **`tests/unit/persistence/newer-schema-version.test.ts` linhas 76, 99 e 122** — o double do `expo-sqlite` continua a ser entregue com `as never`. A linha 99 é nova nesta task. O cast apaga o restante da classe `SQLiteDatabase`.

Correção sugerida, num único ponto:

```ts
import type { SQLiteDatabase } from "expo-sqlite";

function asOpenedDatabase(
  connection: ReturnType<typeof createFakeConnection>,
): SQLiteDatabase {
  return connection as unknown as SQLiteDatabase;
}
```

Não bloqueia a task. O caminho feliz confirma o id vindo de `randomUUID`, um aluno e 32 palavras. O caminho de versão mais nova continua a preservar o arquivo.

2. **`tests/unit/identity/local-learner.test.ts` linha 83 e `tests/unit/seed/seed-vocabulary.test.ts` linha 109** — `withMigratedDatabase` está copiada nos dois arquivos. Um helper em `tests/support` evitaria a cópia. Os dois testes já migram o arquivo antes do comportamento que observam, então a repetição não enfraquece a cobertura.

## ✅ Destaques Positivos

- `LocalLearner.ensure` insere um aluno só quando `AnonymousVisitor` está vazia. O id vem de `expo-crypto` `randomUUID` na abertura do aplicativo. O teste injeta só o gerador e o relógio.
- A segunda garantia devolve o mesmo id e não chama o gerador de novo. Havendo mais de um aluno, o retorno é o `createdAt` mais antigo, sem nova linha e sem alterar `lastSeenAt`.
- A semente só executa `INSERT`. Não há `UPDATE` de inglês, português nem frase. O par normalizado usa `normalizeVocabularyText` de `prisma/seed-data.ts`.
- Texto editado, inclusive com o par normalizado trocado, permanece depois de semear de novo. Uma palavra apagada volta. O id já ocupado não derruba a abertura.
- Duas aberturas do mesmo arquivo SQLite deixam um aluno, 32 palavras ativas e zero linhas em `LearnerWordProgress`. `updatedAt` da linha editada não muda.
- `bootstrapEnglishDatabase` chama `migrate` e, numa transação seguinte, o aluno e a semente. Versão de schema mais nova interrompe antes dessa gravação. A migração 1 permanece congelada.
- Não há método para trocar de aluno e não há cálculo do resumo do dia.
- Não há `any` no código novo. `npx tsc --noEmit` passou. `npx vitest run` passou com 9 arquivos e 32 testes, incluindo os testes das tasks 1 e 2.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | Não se aplica |
| Logging | Não se aplica |
| React | Não se aplica |
| Testes | ✅ |

Não há `CLAUDE.md` neste repositório. A restrição aplicada é a de `AGENTS.md` e a da techspec: `src/lib` continua sem Expo, Prisma Client, React Native e Next. O log `home.seed_failed` fica na task 6, junto da tela de erro.

## Recomendações

1. O cast do double do Expo pode ficar num helper só, como no exemplo acima. Não é pré-requisito da task 4.
2. O helper de banco migrado dos testes de unidade pode ir para `tests/support` quando a task 4 abrir o mesmo arquivo.
3. Não editar `src/persistence/schema-version-one.ts`. Mudança de coluna continua a ser versão 2.
4. `npx expo lint` ainda falha em `src/hooks/use-color-scheme.web.ts`, arquivo que esta task não altera. O erro é `react-hooks/set-state-in-effect`. Fica fora do escopo da task 3.

## Veredito

APROVADO COM OBSERVAÇÕES. O aluno único e o vocabulário inicial estão prontos para a task de fuso. Os dois pontos abertos estão nos testes e não mudam a gravação. `npx tsc --noEmit` e `npx vitest run` passaram.
