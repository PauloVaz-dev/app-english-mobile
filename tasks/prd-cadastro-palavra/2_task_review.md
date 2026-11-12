# Revisão da Tarefa 2.0: Gravação da palavra

## Resultado

Aprovada. Nenhum problema crítico ou maior.

## Verificações

| Verificação | Resultado |
| --- | --- |
| `npx vitest run` (suíte inteira) | 51 arquivos, 417 testes, todos passam |
| Testes desta tarefa | 2 arquivos, 18 testes (6 de unidade, 12 de integração), todos passam |
| `npx tsc --noEmit` | sem erros |
| `npx expo lint` | 1 erro, o que já existia em `src/hooks/use-color-scheme.web.ts`; nenhum novo |
| TDD | os dois arquivos de teste falharam por falta dos módulos antes da implementação |
| Mutação | desligar a conversão da violação do índice em duplicata faz falhar só o teste correspondente |
| Regras copiadas e sorteios | `src/lib/domain/vocabulary/` e `src/persistence/sqlite-word-catalog.ts` sem alteração |
| Migração | nenhuma; usa a tabela `Word` da versão 1 |
| `app-english` | só lido |

## Requirements x testes

| Requirement | Coberto em |
| --- | --- |
| Sem migração, tabela `Word` da versão 1 | integração roda sobre `bootstrapEnglishDatabase` sem mudar o esquema |
| Texto inválido não abre transação nem toca o banco | unidade "rejects invalid text without opening a transaction"; integração "does not touch the database for invalid text" (executor e transação espionados, zero chamadas) |
| Duplicata por `vocabularyKey`, catálogo inteiro na transação, inclusive inativa; não cria nem altera; devolve o texto gravado | unidade (duplicata ativa e inativa); integração "refuses a duplicate of an initial word" e "of an inactive word without reactivating it" (todas as linhas iguais antes e depois) |
| Linha ativa, texto limpo, frase vazia nula, colunas normalizadas por `normalizeVocabularyText`, `updatedAt` do relógio | integração "stores a new word that survives closing and reopening" e "stores an empty example sentence as null" |
| Nenhuma linha em `LearnerWordProgress` | integração (contagem zero depois de gravar e depois de sortear) |
| Falha no meio da transação sem linha parcial | integração "leaves no partial row when the transaction fails after the insert" e "rethrows a storage failure that is not a duplicate" |
| Violação do índice único vira duplicata | integração "turns a unique index violation inside the transaction into a duplicate" (catálogo escondido para que só o índice barre) |
| Sobrevive a reabrir; semeadura não duplica | integração "survives closing and reopening" e "does not duplicate the registered word when the seed runs again" |
| Sorteável sem histórico (`drawPracticeWords`, `drawChallengeWords`) | integração "lets the new word be drawn as a word without history" |
| Dez cadastros com uma duplicata gravam nove (techspec) | integração "registers ten words in sequence" |

## Achados

### Menores

1. `CreateWord` devolve `CreatedWord` (definido no próprio arquivo) em vez do `CatalogWord` do site, e `IdGenerator` também mora em `create-word.ts`. Evita criar arquivos fora de "Arquivos relevantes"; o formato é o mesmo do `CatalogWord`. A lógica do `execute` é a do site, linha a linha.
2. Como no site, `CreateWord` sinaliza inválido e duplicata por exceção (`InvalidVocabularyTextError`, `DuplicateVocabularyError`). Traduzir isso para `RegisterWordOutcome` fica com a composição (tarefa 3.0).
3. A violação do índice é reconhecida relendo a linha pelas colunas normalizadas dentro da mesma transação, sem interpretar a mensagem de erro do SQLite. Assim funciona igual no `expo-sqlite` e no `better-sqlite3`. Se a releitura também falhar, o erro dela substitui o original; caso improvável e ainda tratado como "outra falha".
4. O `id` de colisão de chave primária (mesmo UUID) não vira duplicata: é relançado como falha comum.

### Observações

- `createdAt` também recebe o instante do relógio, como faz a semeadura, em vez do default da coluna.
- O teste de sorteio desativa 13 palavras do vocabulário inicial para deixar exatamente 20 ativas, de modo que a palavra nova sai com certeza nos dois sorteios sem depender do aleatório.
- `src/seed/seed-vocabulary.ts` não precisou mudar: o `WHERE NOT EXISTS` pelas colunas normalizadas e pelo `id` já impede que a semeadura duplique a palavra cadastrada.
- Decisão de produto já registrada (sem bloqueio para a 3.0): duplicata de palavra inativa é recusada e não há como reativá-la nesta entrega.

### Positivos

- `src/lib/application/vocabulary` só importa o domínio; nada de Expo, React Native ou banco.
- O repositório segue o padrão de `sqlite-game-session-repository.ts` (executor + `RunInTransaction`, SQL em constantes, aspas duplas).
