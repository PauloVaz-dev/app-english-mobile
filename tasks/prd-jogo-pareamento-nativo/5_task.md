# Tarefa 5.0: Tela do treino livre

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Substituir o aviso de atividade indisponível em `/treino-livre` pela partida de 20 palavras: introdução, partida com o `PairBoard`, resultado e catálogo insuficiente. A tela usa a composição da tarefa 3.0 e o tabuleiro da tarefa 4.0.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- A rota `src/app/treino-livre.tsx` deixa de ser o placeholder da fundação.
- Um toque começa a partida, sem escolher tamanho, deck ou dificuldade.
- O cabeçalho mostra cronômetro, acertos, erros e progresso até 20, sem empurrar os cartões para fora da vista.
- O cronômetro começa com a partida e para ao concluir ou abandonar.
- A tela passa as palavras ao `PairBoard`, grava exposição em `onReady` e `onPairsEntered`, e grava a tentativa em `onAttempt`.
- Falha ao gravar mostra "Tentar de novo" e reenvia pelo mesmo `attemptId`.
- Sair da rota abandona a partida ativa.
- O resultado mostra duração, acertos, erros, precisão e tempo médio, depois "Precisa revisar" e então "Mandou bem". Sem candidatas, diz que não houve destaque. Ações: jogar de novo ou voltar à entrada.
- Catálogo com menos de 20 ativas mostra mensagem própria, sem partida.
- Uma única composição por partida.
- A lógica da tela fica em módulo puro, fora de `src/app/`.
</requirements>

## Subtarefas

- [x] 5.1 Escrever os testes de unidade que falham para os estados da tela: introdução, partida, falha com "Tentar de novo", resultado com e sem destaque, catálogo insuficiente.
- [x] 5.2 Escrever o teste de integração que falha: sair no meio grava `ABANDONED` e o resultado de uma partida concluída é o mesmo depois de reabrir o banco.
- [x] 5.3 Implementar `practice-screen.ts` e `practice-screen.tsx` com a composição e o `PairBoard`.
- [x] 5.4 Ligar a rota `/treino-livre`.
- [x] 5.5 Refatorar até os testes passarem e conferir que o bundle Android compila.

## Detalhes de Implementação

Ver `techspec.md`: Visão Geral dos Componentes (fluxo do treino) e Monitoramento. O padrão de tela está em `src/components/challenge/challenge-screen.tsx` e `src/lib/presentation/challenge/challenge-screen.ts`.

## Critérios de Sucesso

- `/treino-livre` não mostra mais o texto de atividade indisponível.
- Uma partida de 20 palavras vai da introdução ao resultado no aparelho.
- Fechar e abrir o aplicativo mostra o mesmo resultado da partida encerrada.
- A entrada continua com as mesmas quatro ações.

## Testes da Tarefa

- [x] Testes de unidade: estados e textos da tela com composição falsa.
- [x] Testes de integração: abandono e resultado pela composição contra o SQLite de teste.
- [ ] Testes E2E: não se aplicam. A verificação no aparelho é manual, num development build.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/app/treino-livre.tsx`
- `src/lib/presentation/game/practice-screen.ts`
- `src/components/game/practice-screen.tsx`
- `src/components/game/pair-board.tsx`
- `src/composition/installed-practice.ts`
- `tests/unit/presentation/game/practice-screen.test.ts`
- `tests/integration/composition/practice-screen.test.ts`
