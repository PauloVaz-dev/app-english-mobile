# Tarefa 3.0: Composição do cadastro

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Ligar o caso de uso a uma composição que a tela vai usar: `register` devolve criada, inválida ou duplicata, e rejeita qualquer outra falha depois de registrar o evento. A ligação ao aparelho fica num arquivo `installed-*`. Ainda não há tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- `register` devolve `created`, `invalid` (com os erros por campo) ou `duplicate` (com o texto gravado), conforme `techspec.md`.
- Outra falha registra `words.create_failed` e rejeita. O texto digitado nunca entra no log.
- `src/composition/word-registration.ts` não importa Expo nem React Native.
- `installed-word-registration.ts` usa a abertura do banco da fundação (`prepareHomeStudy`), `randomUUID` de `expo-crypto` e `logDeviceEvent`, com imports estáticos nomeados. Sem `import()` dinâmico.
- Duas chamadas seguidas não rodam transações ao mesmo tempo.
</requirements>

## Subtarefas

- [x] 3.1 Escrever os testes de unidade que falham com dependências falsas: os três resultados, a falha com evento e sem texto no log, chamadas em ordem.
- [x] 3.2 Escrever o teste de integração que falha: dez cadastros em sequência pela composição, com uma frase e uma duplicata, gravam nove linhas.
- [x] 3.3 Implementar `createWordRegistration`.
- [x] 3.4 Implementar `installed-word-registration.ts`.
- [x] 3.5 Refatorar até os testes passarem.

## Detalhes de Implementação

Ver `techspec.md`: Interfaces Principais (`WordRegistration`), Pontos de Integração e Monitoramento. O padrão está em `src/composition/practice.ts` e `src/composition/installed-practice.ts`.

## Critérios de Sucesso

- A meta de sucesso do PRD (dez palavras, uma frase e uma duplicata recusada) passa pela composição contra o SQLite de teste.
- Nenhum log contém o texto digitado.

## Testes da Tarefa

- [x] Testes de unidade: composição com dependências falsas.
- [x] Testes de integração: composição contra o `better-sqlite3`.
- [x] Testes E2E: não se aplicam. Não há tela.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/composition/word-registration.ts`
- `src/composition/installed-word-registration.ts`
- `src/observability/device-event-log.ts`
- `tests/unit/composition/word-registration.test.ts`
- `tests/integration/composition/word-registration.test.ts`
