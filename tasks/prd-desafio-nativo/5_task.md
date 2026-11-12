# Tarefa 5.0: Tela do desafio

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Substituir o aviso de atividade indisponível pela introdução, pela rodada e pelo resultado do desafio de 60 segundos. Os cartões não são implementados aqui: a área central usa a porta `PairBoard` da especificação do jogo de pareamento. Sem essa porta, a task para na composição e deixa a área pronta para recebê-la.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- A rota `src/app/desafio.tsx` deixa de ser o placeholder da fundação.
- Antes de começar, a tela diz que são 60 segundos, que o objetivo é acertar o máximo de pares e que a sequência aumenta os pontos.
- O cronômetro mostrado é `deadline - now`, refeito ao voltar para o primeiro plano. O intervalo da tela não é a fonte do tempo.
- Sair da rota abandona a sessão ativa e não atualiza o recorde.
- Ir para segundo plano não abandona e não pausa.
- Nos dez segundos finais, o tempo restante aparece como número, não só como cor.
- No zero, a pessoa vê que o tempo acabou antes do resultado.
- O resultado mostra acertos, pontuação, precisão, maior sequência e se houve recorde novo, com ação de jogar de novo ou voltar à entrada.
- Revisão e treino de 20 palavras continuam sendo outros caminhos.
- Alvos principais com pelo menos 44 por 44 pontos e nomes para leitor de tela. O tempo não é anunciado a cada segundo.
- A área dos cartões só chama `PairBoard`. Não criar outra regra de acerto, erro ou reposição.
- Depende das tarefas 3.0 e 4.0. A ligação dos cartões depende de `prd-jogo-pareamento-nativo`.
</requirements>

## Subtarefas

- [x] 5.1 Escrever o teste de unidade que falha enquanto o estado da tela não distingue introdução, urgência final, tempo esgotado e resultado com e sem recorde novo.
- [x] 5.2 Escrever o teste de integração que falha enquanto sair da rodada ativa não grava `ABANDONED` e o zero não conclui no prazo.
- [x] 5.3 Implementar a rota com introdução, cabeçalho e resultado, usando a composição.
- [x] 5.4 Ligar `AppState` para recalcular o restante e o abandono à saída da rota.
- [x] 5.5 Reservar a área de `PairBoard`. Se a porta ainda não existir, a área explica que os cartões entram com o jogo de pareamento, sem simular o tabuleiro.

## Detalhes de Implementação

Ver `techspec.md`: fluxo da tela, Sequenciamento (a etapa visual espera a porta do jogo) e a decisão de não reimplementar o pareamento.

O relógio de domínio continua sendo o prazo. A tela só desenha o que a composição já decidiu.

## Critérios de Sucesso

- A rota do desafio não mostra mais o texto de atividade indisponível da fundação.
- Sair no meio grava abandono e o recorde anterior permanece.
- Voltar do segundo plano com o prazo já vencido conclui a sessão e não aceita tentativa nova.
- Empate não aparece como recorde novo.
- Nenhum componente desta task implementa seleção de cartão, acerto ou reposição.

## Testes da Tarefa

- [x] Testes de unidade: estados da tela e o texto de recorde, com composição falsa.
- [x] Testes de integração: abandono e expiração pela composição contra o SQLite de teste.
- [ ] Testes E2E: não se aplicam. A techspec exclui Playwright, e o tabuleiro ainda não tem especificação.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/app/desafio.tsx`
- `src/composition/challenge.ts`
- `src/speech/device-speech.ts`
- `tasks/prd-jogo-pareamento-nativo/prd.md`
