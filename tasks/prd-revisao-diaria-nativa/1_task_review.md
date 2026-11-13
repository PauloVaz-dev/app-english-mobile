# Review: Task 1.0 - Regras da revisão copiadas do site

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 1_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

A tarefa traz para o aplicativo, em memória, a sessão de revisão, a correção da digitação com "quase" e as notas da digitação e do pareamento. Os módulos copiados de `app-english` estão idênticos ao site. `review-schedule.ts` e `daily-review-plan.ts` foram reutilizados. `fastest-levenshtein` entrou por `npm install`. Os testes da tarefa, a suíte inteira, `npx tsc --noEmit` e `npx expo lint` passaram. Não há issue crítica nem major.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/lib/domain/review/review-session.ts` | ✅ OK | 0 |
| `src/lib/domain/review/errors.ts` | ✅ OK | 0 |
| `src/lib/domain/review/index.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/typing-answer.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/typing-review.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/matching-review.ts` | ⚠️ Problemas | 1 |
| `tests/unit/domain/review/review-session.test.ts` | ✅ OK | 0 |
| `tests/unit/domain/review/review-boundary.test.ts` | ✅ OK | 0 |
| `tests/unit/domain/learning/typing-answer.test.ts` | ✅ OK | 0 |
| `tests/unit/domain/learning/typing-review.test.ts` | ✅ OK | 0 |
| `tests/unit/domain/learning/matching-review.test.ts` | ✅ OK | 0 |
| `tests/integration/domain/review-memory-session.test.ts` | ✅ OK | 0 |
| `tests/unit/domain/game/rules-boundary.test.ts` | ✅ OK | 0 |
| `package.json` | ✅ OK | 0 |
| `package-lock.json` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. **Comentários herdados da cópia** em `src/lib/domain/learning/matching-review.ts`, linhas 12, 14, 24-30 e 56-59. O padrão do review pede código sem comentário. Esses blocos explicam por que o pareamento limita a nota e por que o último par vale no máximo Difícil. Permanecem porque a tarefa exige cópia idêntica da regra; apagá-los afastaria o arquivo do site sem mudar comportamento. Nenhuma correção nesta tarefa.

2. **Comando que também devolve resultado** em `src/lib/domain/review/review-session.ts`, método `recordTypingAttempt` (linhas 261-296). O método grava a tentativa e retorna a nota. É o contrato do site, coberto pelos testes copiados. Separar gravação e consulta mudaria a API. Nenhuma correção nesta tarefa.

## ✅ Destaques Positivos

- Os testes do site foram copiados e falharam primeiro pela ausência dos módulos. A implementação veio depois.
- `diff` dos seis módulos contra `app-english` não mostra diferença. A regra não foi reescrita.
- A agenda continua em `scheduleReview` já existente. O plano do dia não foi copiado de novo.
- A sessão em memória cobre "não sei", erro com reforço, dica, teto Bom, último par em Difícil e distratora sem nota.
- A fronteira nova recusa Expo, React Native e banco. A fronteira antiga só aceita `fastest-levenshtein` em `typing-answer.ts`.
- Nenhum arquivo novo importa Expo, React Native ou banco.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | ✅ (não se aplica) |
| Logging | ✅ (não se aplica) |
| React | ✅ (não se aplica) |
| Testes | ✅ |

Os avisos de padrão são os dois itens minor da cópia. Nomes, arquivos e constantes da regra seguem o site. Não há `any`. A classe `ReviewSession` fica abaixo de 300 linhas e os métodos abaixo de 50.

## Recomendações

1. Manter os módulos copiados idênticos ao site até uma tarefa pedir, de fato, só ajuste de caminho.
2. Não alargar a exceção de `fastest-levenshtein` para outros arquivos de `src/lib/domain`.
3. Nas tarefas 2 a 6, continuar usando `scheduleReview` e `applyMatchingReview` em vez de recalcular a nota.

## Veredito

**APROVADO COM OBSERVAÇÕES** (APPROVED WITH OBSERVATIONS). Sem issue crítica ou major. A tarefa 1.0 pode ser considerada fechada. As observações são da cópia fiel e não pedem alteração.

Validação desta revisão, com os scripts do repositório (`package-lock.json`; não há Yarn):

- `npx vitest run`: 61 arquivos, 514 testes, todos passando.
- `npx tsc --noEmit`: saída vazia, código de saída 0.
- `npx expo lint`: código de saída 0, sem erro.
