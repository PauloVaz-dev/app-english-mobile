# Tarefa 3.0: Composição do treino

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Ligar sorteio, sessão, repositório, voz e eventos numa composição que a tela vai usar: começar, expor, registrar tentativa, abandonar e ler o resultado. A ligação ao aparelho fica num arquivo `installed-*`. Ainda não há tabuleiro nem tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- `start` sorteia, cria a sessão `FREE` e devolve id e palavras. Com menos de 20 ativas, falha com estado de catálogo insuficiente e não cria sessão.
- `expose` registra a entrada de pares no tabuleiro.
- `attempt` é idempotente pelo `attemptId`. As gravações de uma sessão seguem a ordem das tentativas, numa fila, mesmo com toques rápidos.
- A voz fala o inglês só depois de um acerto novo gravado, sem `await`. Falha de voz registra `practice.speech_failed` e a partida segue.
- Falha ao gravar registra `practice.persist_failed` e repassa o erro, para a tela mostrar "Tentar de novo".
- `abandon` grava `ABANDONED`. Sessão já encerrada não muda.
- `result` devolve duração, acertos, erros, precisão, tempo médio e as duas listas, lidos do banco.
- `installed-practice.ts` usa a abertura do banco da fundação, `expo-crypto` para ids, `Math.random`, `console.error` e `createDeviceSpeech`, com imports estáticos nomeados. Sem `import()` dinâmico.
</requirements>

## Subtarefas

- [x] 3.1 Escrever os testes de unidade que falham com catálogo, repositório e voz falsos: catálogo insuficiente, fila em ordem, idempotência, voz só no acerto novo, evento de falha.
- [x] 3.2 Escrever o teste de integração que falha: partida completa de 20 pela composição contra o SQLite de teste, com voz simulada que falha.
- [x] 3.3 Implementar `createPracticeComposition`.
- [x] 3.4 Implementar `installed-practice.ts`.
- [x] 3.5 Refatorar até os testes passarem.

## Detalhes de Implementação

Ver `techspec.md`: Interfaces Principais (`PracticeComposition`), Pontos de Integração, Monitoramento e Decisões Principais (o feedback não espera o banco). O padrão de composição está em `src/composition/challenge.ts` e `src/composition/installed-challenge.ts`.

## Critérios de Sucesso

- Uma partida completa pela composição grava o mesmo que a sessão em memória calcula.
- Falha de voz não muda acerto, registro nem reposição.
- `src/composition/practice.ts` não importa Expo nem React Native.

## Testes da Tarefa

- [x] Testes de unidade: composição com dependências falsas.
- [x] Testes de integração: composição contra o `better-sqlite3`, partida completa e abandono.
- [ ] Testes E2E: não se aplicam. Não há tela.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/composition/practice.ts`
- `src/composition/installed-practice.ts`
- `src/speech/device-speech.ts`
- `tests/unit/composition/practice-composition.test.ts`
- `tests/integration/composition/practice-composition.test.ts`
