# Review: Task 2.0 - Banco SQLite na versão 1

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 2_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

A migração 1 abre `english.db`, liga `foreign_keys` e `WAL` fora da transação e cria, na mesma transação, as doze tabelas do Prisma com chaves, `ON DELETE` e `PRAGMA user_version = 1`. O mesmo SQL passa por um executor mínimo: no Vitest via `better-sqlite3`, no aplicativo via `expo-sqlite`. Versão gravada acima da suportada interrompe a abertura e preserva o arquivo. Nenhuma tela mudou.

Durante a revisão, os helpers de fixture que usavam flag booleana ou quatro parâmetros foram separados em funções com verbo (`defineRequiredText`, `defineOptionalText` e equivalentes), e os literais `0` e `1` do leitor de schema viraram constantes nomeadas. Os testes foram executados de novo depois desses ajustes.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/persistence/sql-executor.ts` | ✅ OK | 0 |
| `src/persistence/schema-version-one.ts` | ✅ OK | 0 |
| `src/persistence/migrate.ts` | ✅ OK | 0 |
| `src/persistence/expo-sqlite-executor.ts` | ✅ OK | 0 |
| `src/persistence/open-english-database.ts` | ✅ OK | 0 |
| `tests/support/better-sqlite-executor.ts` | ✅ OK | 0 |
| `tests/support/expected-sqlite-schema.ts` | ✅ OK | 0 |
| `tests/support/read-sqlite-schema.ts` | ✅ OK | 0 |
| `tests/support/temporary-database.ts` | ✅ OK | 0 |
| `tests/integration/persistence/sqlite-daily-summary.test.ts` | ✅ OK | 0 |
| `tests/unit/persistence/newer-schema-version.test.ts` | ⚠️ Problemas | 1 |
| `package.json` | ✅ OK | 0 |
| `package-lock.json` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. **`tests/unit/persistence/newer-schema-version.test.ts` linhas 59 e 86** — o double do `expo-sqlite` é entregue ao mock com `as never`. O teste cobre os métodos usados (`execAsync`, `getAllAsync`, `runAsync`, `withTransactionAsync`), mas o cast apaga o restante da classe `SQLiteDatabase`.

Correção sugerida, concentrando o cast num único ponto:

```ts
import type { SQLiteDatabase } from "expo-sqlite";

function asOpenedDatabase(
  connection: ReturnType<typeof createFakeConnection>,
): SQLiteDatabase {
  return connection as unknown as SQLiteDatabase;
}
```

Não bloqueia a task. O caminho feliz e o caminho de versão mais nova já passam por esse double e conferem `user_version`, tabelas e preservação do arquivo.

## ✅ Destaques Positivos

- O SQL da versão 1 mora num único constante. `PRAGMA user_version = 1` entra na mesma transação das tabelas; `foreign_keys` e `WAL` ficam fora dela.
- A segunda abertura do mesmo arquivo não dispara `CREATE TABLE` nem altera a versão. Uma linha já gravada permanece.
- Versão maior que a suportada lança `NewerSchemaError` antes de qualquer transação, não cria `Word` e não apaga o arquivo. O opener chama `openDatabaseAsync("english.db")` sem diretório próprio e não chama `deleteDatabaseAsync`.
- O schema cobre as doze tabelas, as chaves únicas, as chaves estrangeiras com `ON DELETE` do Prisma e os índices da entrada, inclusive `(visitorId, nextReviewAt)`, `Word.active` e `(visitorId, localDate)`.
- Identificadores são `TEXT`, instantes são `TEXT` em ISO-8601 e booleanos são `INTEGER`.
- `migrate` devolve `void`. A leitura da versão e a escrita do schema estão em funções separadas, e o chamador não consegue aplicar a versão 1 sem passar pela checagem.
- Não há `any` no código novo. `npx tsc --noEmit` passou. `npx vitest run` passou com 6 arquivos e 26 testes, incluindo os testes da task 1.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | Não se aplica |
| Logging | Não se aplica |
| React | Não se aplica |
| Testes | ✅ |

## Recomendações

1. O cast do double do Expo pode ficar num helper só, como no exemplo acima. Não é pré-requisito da task 3.
2. Não editar `src/persistence/schema-version-one.ts` depois desta entrega. Mudança de coluna é versão 2, na mesma transação do incremento.
3. `npx expo lint` ainda falha em `src/hooks/use-color-scheme.web.ts`, arquivo que esta task não altera. O erro é `react-hooks/set-state-in-effect`. Fica fora do escopo da task 2.

## Veredito

APROVADO COM OBSERVAÇÕES. A migração 1 está pronta para as tasks de aluno, semente e resumo. O único ponto aberto é o cast do teste do opener, e ele não muda o comportamento coberto. `npx tsc --noEmit` e `npx vitest run` passaram.
