# Revisão da Tarefa 1.0: Regras de vocabulário copiadas do site

## Resultado

Aprovada. Nenhum problema crítico ou maior.

## Verificações

| Verificação | Resultado |
| --- | --- |
| `npx vitest run` (suíte inteira) | 49 arquivos, 399 testes, todos passam |
| Testes desta tarefa | 7 arquivos, 38 testes, todos passam |
| `npx tsc --noEmit` | sem erros |
| `npx expo lint` | 1 erro, o que já existia em `src/hooks/use-color-scheme.web.ts`; nenhum novo |
| Módulos copiados x site (`diff`) | `vocabulary-text.ts`, `vocabulary-key.ts`, `vocabulary-entry.ts` idênticos |
| Testes copiados x site (`diff`) | `vocabulary-text.test.ts`, `vocabulary-key.test.ts` idênticos |
| `app-english` | só lido; nada foi editado |

## Requirements x testes

| Requirement | Coberto em |
| --- | --- |
| Cópia sem mudança de regra | testes do site copiados sem edição; `diff` dos módulos |
| `index.ts` sem `import-parser` | `src/lib/domain/vocabulary/index.ts`; o import-parser não foi copiado |
| Obrigatórios, só espaço é vazio, 80 após limpar espaços | `vocabulary-text-limits.test.ts` (80, 81, espaço/tab/quebra, medida depois de juntar espaços) |
| Frase opcional, 240, vazia vira ausente | `vocabulary-text-limits.test.ts` (240, 241, `""`, só espaço, `null`, `undefined`) |
| Dois erros juntos | `vocabulary-text-limits.test.ts`, `vocabulary-text.test.ts` |
| Chave ignora maiúscula, acento e espaço; um lado diferente é outra chave | `vocabulary-duplicate-key.test.ts`, `vocabulary-key.test.ts` |
| `findDuplicateEntry` encontra inativa | `vocabulary-entry.test.ts` |
| Texto guardado mantém acento e maiúscula | `vocabulary-text-limits.test.ts`, `vocabulary-entry.test.ts`, erro de duplicata com o texto gravado |
| Sem Expo, React Native ou banco | `vocabulary-boundary.test.ts` (segue imports relativos e `@/`; verificado que falha com um `import "expo-sqlite"` de prova) |
| Integração com o vocabulário inicial | `tests/integration/domain/vocabulary-seed-duplicates.test.ts` |

## Achados

### Menores

1. `index.ts` exporta `VocabularyTextIssue`, que o `index.ts` do site não exporta. A techspec usa esse tipo em `RegisterWordOutcome` (tarefa 3.0). É só exportação de tipo; nenhuma regra muda.
2. `index.ts` não exporta `compareVocabularyEntries`, que serve à listagem, fora do escopo deste PRD. O arquivo `vocabulary-entry.ts` continua com ela e com `withTexts`, `deactivate` e `reactivate`, porque a cópia é integral. São código sem uso neste app até o PRD de vocabulário.
3. As mensagens de `InvalidVocabularyTextError` e `DuplicateVocabularyError` estão em inglês, como no site. A tela (tarefa 4.0) deve montar o texto em português a partir de `field`, `reason` e `existing`, nunca exibir `message`.

### Observações

- Duplicata de palavra inativa é recusada, como na techspec. A pessoa verá o aviso de uma palavra que não aparece em lista nenhuma e que não pode reativar nesta entrega. Não bloqueia a tarefa 2.0; é decisão já registrada na techspec.
- O teste de fronteira já existente (`tests/integration/lib-boundary.test.ts`) só barra Prisma e Next. O novo teste é específico de `src/lib/domain/vocabulary` e barra `expo*`, `@expo/*`, `react-native*`, `@react-native*`, `better-sqlite3`, `@prisma/*` e qualquer arquivo de `src/persistence`.

### Positivos

- TDD seguido: os testes copiados e os novos falharam por falta dos módulos antes da cópia.
- O alias `@/lib/...` dos testes do site resolve para `src/lib/...` sem ajuste.
- O teste de integração confirma que o vocabulário inicial não tem chaves repetidas.
