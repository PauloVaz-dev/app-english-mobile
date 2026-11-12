# Review: Task 4.0 - Fuso do aparelho

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 4_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

O fuso de estudo passa a vir do primeiro calendário do aparelho. Um nome IANA que `isValidTimeZone` aceita é gravado quando difere do valor do aluno. `null`, calendário ausente e texto rejeitado preservam o fuso já gravado. Sem fuso válido gravado, o resultado é `America/Sao_Paulo`. Fechar e abrir o mesmo arquivo SQLite devolve o último fuso válido. A volta ao primeiro plano dispara uma nova leitura. O resumo do dia não é calculado e a entrada não foi desenhada.

O repositório ainda não tem commits, então não há diff contra uma base. A revisão cobriu os arquivos desta task, sem desfazer aluno, semente, executor ou a migração 1.

Não há problema crítico nem major. O ponto abaixo está só nos testes e não muda a gravação.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/time/device-time-zone.ts` | ✅ OK | 0 |
| `src/persistence/sqlite-visitor-preferences.ts` | ✅ OK | 0 |
| `tests/unit/time/device-time-zone.test.ts` | ⚠️ Problemas | 1 |
| `tests/unit/time/installed-device-time-zone.test.ts` | ⚠️ Problemas | 1 |
| `tests/integration/persistence/sqlite-visitor-preferences.test.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/local-day.ts` | ✅ OK | 0 |
| `src/persistence/schema-version-one.ts` | ✅ OK | 0 |

`local-day.ts` e `schema-version-one.ts` foram lidos e não foram alterados. `src/app` não ganhou tela.

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. **`tests/unit/time/device-time-zone.test.ts` linha 184 e `tests/unit/time/installed-device-time-zone.test.ts` linha 113** — `MemoryPreferences` está copiada nos dois arquivos. O double da leitura instalada ainda ignora o `visitorId` em `getTimeZone`. Os dois testes já observam o fuso que interessa, então a cópia não enfraquece o caminho feliz.

Correção sugerida, num único ponto em `tests/support`:

```ts
export class MemoryPreferences implements VisitorPreferences {
  readonly saved: SavedTimeZone[] = [];
  private readonly zones = new Map<string, string>();

  constructor(visitorId?: string, timeZone?: string | null) {
    if (visitorId !== undefined && timeZone != null) {
      this.zones.set(visitorId, timeZone);
    }
  }

  async getTimeZone(visitorId: string): Promise<string | null> {
    return this.zones.get(visitorId) ?? null;
  }

  async saveTimeZone(visitorId: string, timeZone: string, seenAt: Date): Promise<void> {
    this.zones.set(visitorId, timeZone);
    this.saved.push({ visitorId, timeZone, seenAt });
  }
}
```

Não bloqueia a task. O teste de unidade já confere que outro aluno não recebe o fuso, e o teste instalado confirma que `getCalendars()[0].timeZone` é a origem.

## ✅ Destaques Positivos

- `applyDeviceTimeZone` lê o calendário injetado e só chama `saveTimeZone` quando o fuso do aparelho é válido e diferente do armazenado. `null`, lista vazia, `""` e `Nowhere/City` não apagam o valor gravado.
- Sem fuso válido no aluno, o retorno é `DEFAULT_TIME_ZONE` (`America/Sao_Paulo`), sem gravar o fallback. Um fuso inválido já gravado também não é usado no dia de estudo e não é apagado até chegar um nome IANA válido.
- A regra continua em `isValidTimeZone` e `DEFAULT_TIME_ZONE`. `local-day.ts` não foi reescrito.
- `readInstalledCalendars` usa `getCalendars()[0].timeZone`. `watchInstalledForeground` escuta `AppState` e só relê quando o estado é `active`. A entrada não foi desenhada.
- `SqliteVisitorPreferences` lê e grava `AnonymousVisitor.timeZone` no arquivo já migrado. Um valor rejeitado ou uma data inválida não altera a linha. `lastSeenAt` não anda para trás. Visitante ausente não cria outro aluno.
- Fechar e abrir o mesmo SQLite devolve o último fuso válido. A migração 1 permanece congelada.
- Não há `any` no código novo. `src/lib` continua sem Expo, Prisma Client, React Native e Next.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | Não se aplica |
| Logging | Não se aplica |
| React | Não se aplica |
| Testes | ✅ |

Não há `CLAUDE.md` neste repositório. A restrição aplicada é a de `AGENTS.md` e a da techspec: `src/lib` continua sem Expo, Prisma Client, React Native e Next. `applyDeviceTimeZone` e `saveTimeZone` coordenam uma leitura e uma gravação, no mesmo formato de `LocalLearner.ensure`. A consulta e a escrita ficam em funções separadas. O log `home.summary_failed` continua na task 6.

`npx tsc --noEmit` passou. `npx vitest run` passou com 12 arquivos e 49 testes. Os 32 testes anteriores, das tasks 1, 2 e 3, continuam nesse total e passaram.

## Recomendações

1. O double de preferências pode ir para `tests/support` quando a task 5 precisar do mesmo fuso falso. Não é pré-requisito da task 5.
2. A task 6 deve chamar `applyInstalledTimeZone` na carga e `watchInstalledForeground` na volta ao primeiro plano, tratando a falha da releitura. Esta task não desenha a entrada.
3. Não editar `src/persistence/schema-version-one.ts`. Mudança de coluna continua a ser versão 2.
4. `npx expo lint` ainda falha em `src/hooks/use-color-scheme.web.ts`, arquivo que esta task não altera. O erro é `react-hooks/set-state-in-effect`. Fica fora do escopo da task 4.

## Veredito

APROVADO COM OBSERVAÇÕES. O fuso do aparelho fica gravado e sobrevive a fechar o arquivo. A observação está na cópia do double de teste e não muda a regra do dia. `npx tsc --noEmit` e `npx vitest run` passaram.
