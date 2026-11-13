# Review: Task 5.0 - Cartão de digitação

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 5_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

O cartão de digitação ficou em estado puro e num componente. Ele mostra o português, recebe o inglês, mede o tempo desde o aparecimento, revela a primeira letra, envia "não sei" sem texto e devolve certo, quase, erro e "não sei" com ícone, texto, grafia correta e frase de exemplo. Não importa composição, repositório nem regra de nota, e não monta a tela da revisão. Os 18 testes da tarefa, a suíte (587), `npx tsc --noEmit` e `npx expo lint` passaram. Não há issue crítica nem major.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/lib/presentation/review/typing-card.ts` | ⚠️ Problemas | 1 |
| `src/components/review/typing-card.tsx` | ⚠️ Problemas | 1 |
| `tests/unit/presentation/review/typing-card.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. **O controlador grava e também dispara efeitos** em `src/lib/presentation/review/typing-card.ts`, método `apply` (linhas 279-284). Ele guarda o estado e, em seguida, anuncia, envia ou pede o próximo cartão. É o mesmo desenho do `PairBoardController`: o anúncio sai uma vez, depois da troca de estado. Separar os dois mudaria o encaixe que a tarefa pede. Nenhuma correção.

2. **Linha longa do título** em `src/components/review/typing-card.tsx`, linha 116. O cabeçalho junta papel, rótulo de acessibilidade e estilo numa linha só. O lint não exige quebra, e o texto do português continua no elemento seguinte. Nenhuma correção.

## ✅ Destaques Positivos

- O teste da tarefa falhou primeiro porque o módulo não existia. A implementação veio depois.
- Dica, envio vazio, "não sei", tempo desde o aparecimento, reforço e a sequência de três cartões estão no estado puro, com as submissões na ordem e os tempos certos.
- Certo, quase e erro diferem por ícone e por texto. O anúncio leva o resultado e a grafia correta; a frase de exemplo entra quando existe.
- O campo usa `submitBehavior="submit"`, `returnKeyType="send"`, `autoCapitalize="none"`, `autoCorrect={false}`, `spellCheck={false}`, `autoComplete="off"`, `textContentType="none"` e `importantForAutofill="no"`, props conferidas nos tipos do React Native 0.88. Não há `blur`.
- Português, campo, Dica e Não sei ficam dentro do `KeyboardAvoidingView` com `behavior="padding"`. O foco volta a cada cartão sem recomeçar o relógio do mesmo cartão.
- O alvo mínimo é o de 44 pontos da entrada. O componente não importa composição, persistência, `typing-review`, `typing-answer` nem sessão.
- `TypingCardController` tem 90 linhas. Nenhum método novo passa de 50. Não há `any`.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | ✅ (não se aplica) |
| Logging | ✅ (não se aplica) |
| React | ✅ |
| Testes | ✅ |

O aviso de padrão é o item minor do `apply`, o mesmo desenho do tabuleiro. `npx tsc --noEmit` passou. `npx expo lint` passou. A suíte ficou em 69 arquivos e 587 testes.

## Recomendações

1. Na tarefa 6, a tela é quem chama a composição. O cartão só recebe o prompt e o resultado, e devolve a submissão.
2. Ao avançar, trocar o `wordId` ou o reforço. O mesmo cartão não reinicia o relógio.
3. Limpar o resultado ao abrir o próximo cartão. Um resultado que chegue junto com um prompt novo não é aplicado, porque o cartão novo ainda está em resposta.
4. A verificação no aparelho continua manual, num development build. Esta tarefa não cobre teclado real.

## Veredito

Aprovado com observações. Não há issue crítica nem major. A tarefa 6 pode usar o cartão sem trazer banco, sessão ou nota para dentro dele.
