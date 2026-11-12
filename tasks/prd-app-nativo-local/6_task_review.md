# Review: Task 6.0 - Entrada e destinos indisponíveis

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 6_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

A rota inicial deixou de ser o login do clone e passou a carregar o resumo do dia. `HomeComposition.load` executa migração, aluno, semente, fuso e `GetDailyReviewSummary`, e devolve a view já existente em `toHomeReviewSummaryView`. As rotas de revisão, treino livre, desafio e palavras só anunciam que a atividade ainda não está disponível. Falha de abertura registra `home.migration_failed`, `home.seed_failed` ou `home.summary_failed`, mostra tentar de novo e não apaga `english.db`.

`npx vitest run` passou com 15 arquivos e 63 testes, inclusive os das tarefas 1 a 5. `npx tsc --noEmit` passou. Não há teste de interface, como a techspec pede.

O primeiro desenho da entrada quebrava no aparelho: o `Link` com `asChild` recebia um array de estilos. O Expo Router rejeita isso no `Slot`. Os estilos dos alvos foram achatados com `StyleSheet.flatten` antes do review fechar.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/composition/home.ts` | ✅ OK | 0 |
| `src/composition/prepare-home-study.ts` | ✅ OK | 0 |
| `src/composition/installed-home.ts` | ✅ OK | 0 |
| `src/observability/home-open-log.ts` | ✅ OK | 0 |
| `src/components/home/home-entry-screen.tsx` | ⚠️ Problemas | 1 |
| `src/components/home/unavailable-activity.tsx` | ⚠️ Problemas | 1 |
| `src/app/index.tsx` | ✅ OK | 0 |
| `src/app/revisar.tsx` | ✅ OK | 0 |
| `src/app/treino-livre.tsx` | ✅ OK | 0 |
| `src/app/desafio.tsx` | ✅ OK | 0 |
| `src/app/palavras.tsx` | ✅ OK | 0 |
| `tests/unit/composition/home-composition.test.ts` | ✅ OK | 0 |
| `tests/integration/composition/home-load.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. `src/components/home/home-entry-screen.tsx` e `src/components/home/unavailable-activity.tsx` repetem as mesmas medidas de alvo (44 pontos, raio, padding). Um único estilo compartilhado evitaria divergência na próxima tela. Não bloqueia esta entrega.
2. O crash do `Slot` com array de `style` foi corrigido com `StyleSheet.flatten` nos dois `Link`. O Vitest não cobre render, então essa regressão só aparece no aparelho.

## ✅ Destaques Positivos

- A composição reutiliza `GetDailyReviewSummary` e `toHomeReviewSummaryView` sem reescrever as frases.
- Duas aberturas do mesmo arquivo devolvem o mesmo resumo e o mesmo aluno.
- Erro de versão mais nova registra `home.migration_failed`, preserva o arquivo e a carga seguinte funciona depois de restaurar a versão.
- Alvos principais têm no mínimo 44 por 44 pontos e nome para o leitor de tela. O resumo é anunciado como texto.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | ✅ |
| Logging | ✅ |
| React | ⚠️ |
| Testes | ✅ |

REST/HTTP não se aplica: a techspec não cria endpoint. O log fica no aparelho, com os três eventos pedidos. O aviso de React é só a duplicação visual, sem `any` e sem flag booleana.

## Recomendações

1. Recarregar o app no aparelho e confirmar a entrada, os quatro destinos e a volta.
2. Na próxima tela, extrair o estilo do alvo de toque para um único lugar.

## Veredito

Aprovado com observações. A entrada e os destinos indisponíveis estão prontos para a próxima parte do produto. Nenhuma atividade de estudo foi implementada.
