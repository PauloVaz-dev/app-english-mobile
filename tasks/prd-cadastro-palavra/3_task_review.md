# Revisão da Tarefa 3.0: Composição do cadastro

## Resultado

Aprovada. Nenhum problema crítico ou maior.

## Verificações

| Verificação | Resultado |
| --- | --- |
| `npx vitest run` (suíte inteira) | 53 arquivos, 430 testes, todos passam |
| Testes desta tarefa | 2 arquivos, 13 testes (11 de unidade, 2 de integração), todos passam |
| `npx tsc --noEmit` | sem erros |
| `npx expo lint` | 1 erro, o que já existia em `src/hooks/use-color-scheme.web.ts`; nenhum novo |
| TDD | os dois arquivos de teste falharam por falta de `@/composition/word-registration` antes da implementação |
| Mutação | trocar a fila por chamada direta faz falhar os 3 testes de ordem (2 de unidade e o de integração com chamadas simultâneas, que no `better-sqlite3` abre `BEGIN` dentro de `BEGIN`) |
| Expo v58 | `randomUUID` de `expo-crypto` é síncrono e devolve `string`; a doc do `expo-sqlite` confirma que `withTransactionAsync` não é exclusivo, o que justifica a fila |
| Regras copiadas, caso de uso e repositório | sem alteração |
| `app-english` | não foi lido nem alterado nesta tarefa |

## Requirements x testes

| Requirement | Coberto em |
| --- | --- |
| `register` devolve `created` | unidade "returns created with the stored id and the cleaned text"; integração "registers ten words..." |
| `invalid` com os erros por campo, sem abrir transação | unidade "returns invalid with every field error and never opens a transaction" (os três campos) |
| `duplicate` com o texto gravado, sem inserir | unidade "returns duplicate with the stored text..." (palavra inativa, "newyork"); integração (o 4º cadastro devolve `pear`/`pera` gravados) |
| Outra falha registra `words.create_failed` e rejeita com a causa | unidade "records words.create_failed without the typed text and rejects with the cause"; "keeps the rejection when the event log itself throws"; "lets the same text be retried after a failure" |
| Texto digitado nunca entra no log | unidade: o registro recebe só `["words.create_failed"]`, e o JSON dos eventos não contém inglês, português nem frase digitados; o tipo `WordRegistrationEventRecorder` só aceita o nome do evento |
| Falha ao abrir o banco também registra o evento e tenta de novo depois | unidade "records words.create_failed when the database cannot be prepared and retries later" |
| `word-registration.ts` sem Expo e React Native | unidade "keeps Expo and React Native out of the pure composition" |
| `installed-word-registration.ts` com `prepareHomeStudy`, `connectEnglishDatabase`/`createEnglishDatabaseSession`, `randomUUID` de `expo-crypto` e `logDeviceEvent`, imports estáticos nomeados | unidade "wires the device with static named imports only" |
| Duas chamadas seguidas não rodam transações ao mesmo tempo | unidade "runs calls one transaction at a time, in call order" e "prepares once and delegates every call in order"; integração "keeps calls fired together from overlapping transactions" |
| Meta do PRD (dez palavras, uma frase, uma duplicata, nove linhas) | integração "registers ten words in sequence, with a sentence and a refused duplicate, and stores nine" |

## Achados

### Menores

1. Além de `createWordRegistration` (techspec), há `createPreparedWordRegistration`, puro, que abre o banco uma vez na primeira chamada e repete a abertura depois de uma falha. É o equivalente de `createInstalledPractice` + `createPracticeScreenPort`, mas fora do arquivo `installed-*`, para ser testável sem Expo.
2. Uma falha na abertura (migração ou semeadura) gera dois eventos: `home.*_failed`, de `prepareHomeStudy`, e `words.create_failed`. A falha de `connectEnglishDatabase` só gera `words.create_failed`. Nenhum dos dois leva texto digitado.
3. Se várias chamadas esperam a mesma abertura e ela falha, cada uma registra `words.create_failed`. Na tela, o botão bloqueado durante a gravação deixa só uma chamada pendente.
4. `createInstalledWordRegistration` não roda em teste (precisa do Expo); é coberto pela verificação do código-fonte, como `installed-practice.ts`.
5. `npx prettier --check` acusa os arquivos novos porque o `.prettierrc` pede aspas simples; os arquivos existentes (`practice.ts`, `installed-practice.ts`) acusam o mesmo. Mantidas as aspas duplas do código.

### Observações para a tarefa 4.0

- A tela cria uma instância por rota: `createInstalledWordRegistration()` (por exemplo, em `useState(() => ...)`), e chama `register`.
- `invalid.issues` traz `field` e `reason`; as mensagens em português são da tela. Nunca exibir `message` dos erros, que está em inglês.
- Rejeição de `register` = "Não foi possível salvar. Tente de novo."; o texto continua nos campos.
- Decisão de produto já registrada, sem bloqueio: duplicata de palavra inativa é recusada e não pode ser reativada nesta entrega.

### Positivos

- A tradução de exceção para resultado acontece num só lugar; `CreateWord` continua igual ao site.
- A fila segue `DatabaseQueue` de `practice.ts`: uma falha não trava as chamadas seguintes.
