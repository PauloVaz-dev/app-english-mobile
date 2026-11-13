# Tarefa 4.0: Casos de uso e composição da revisão

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Montar a revisão de ponta a ponta sem tela: começar (abandonando a sessão aberta), digitar, expor e parear, concluir, abandonar e ler o resultado. A ligação ao aparelho fica num arquivo `installed-*`.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Copiar de `/home/psgvaz/Projetos/app-english/lib/application/review/` os casos de uso `start-daily-review`, `record-typing-answer`, `finish-review-session`, `load-review-session`, `build-review-result`, `review-session-view`, `resolve-time-zone` e `errors`, ajustando só caminhos.
- `start` abandona a sessão ativa do aluno, se houver, e monta outra com o que ainda vence. Sem vencidas e sem novas, devolve "nada para revisar".
- Pareamento com menos de 3 palavras agendadas recebe distratoras por `selectDistractorWordIds`.
- A digitação mede do aparecimento do cartão até o envio. Errei volta uma vez ao fim da etapa, como reforço.
- A voz fala o inglês depois da resposta digitada e no acerto do pareamento, sem `await`. Falha registra `review.speech_failed` por `logDeviceEvent`.
- Falha ao gravar registra `review.persist_failed` e rejeita; o reenvio usa o mesmo `attemptId`.
- Uma fila única serializa todas as operações de banco da composição.
- O resultado traz acertos, erros, quantas ainda vencem hoje e a data da próxima revisão.
- `src/composition/review.ts` não importa Expo nem React Native. `installed-review.ts` usa a abertura do banco, `applyInstalledTimeZone`, `randomUUID`, `createDeviceSpeech` e `logDeviceEvent`, com imports estáticos nomeados.
</requirements>

## Subtarefas

- [x] 4.1 Copiar `review-use-cases.test.ts` do site e escrever os testes de unidade que faltam com dependências falsas; vê-los falhar.
- [x] 4.2 Escrever o teste de integração que falha: sessão completa contra o SQLite de teste, com erro e reforço, dica, "não sei", pareamento com distratoras e resultado; depois, fechar no meio e começar de novo.
- [x] 4.3 Copiar os casos de uso e implementar `createReviewComposition`.
- [x] 4.4 Implementar `installed-review.ts`.
- [x] 4.5 Refatorar até os testes passarem.

## Detalhes de Implementação

Ver `techspec.md`: Interfaces Principais (`ReviewComposition`), fluxo em Visão Geral dos Componentes, Monitoramento e Decisões Principais (nova sessão em vez de retomar). Padrão de composição: `src/composition/practice.ts` e `src/composition/installed-practice.ts`.

## Critérios de Sucesso

- Três acertos seguidos em dias diferentes deixam a palavra pelo menos 7 dias fora, passando pela composição.
- Fechar no meio e começar de novo não perde nota nem repete palavra já avaliada.
- Treino livre e desafio continuam sem mexer na agenda.

## Testes da Tarefa

- [x] Testes de unidade: casos de uso e composição com dependências falsas.
- [x] Testes de integração: composição contra o `better-sqlite3`, ao longo de dias simulados.
- [x] Testes E2E: não se aplicam. Não há tela.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/lib/application/review/`
- `src/composition/review.ts`
- `src/composition/installed-review.ts`
- `src/lib/domain/learning/word-selection.ts`
- `tests/unit/application/review/`
- `tests/integration/composition/review-composition.test.ts`
