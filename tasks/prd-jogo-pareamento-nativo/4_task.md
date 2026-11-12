# Tarefa 4.0: Tabuleiro PairBoard

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Criar a porta `PairBoard`: o estado puro do tabuleiro e o componente que desenha as duas colunas. O tabuleiro decide acerto e erro na hora, avisa quando os primeiros cartões podem ser tocados e entrega cada tentativa a quem o usa. Ele não conhece sessão, banco, pontuação nem cronômetro. Ainda não entra em nenhuma tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- O estado usa `createGameBoard` e `resolveBoardSelection` da tarefa 1.0. Não criar outra regra de acerto, erro ou reposição.
- Selecionar um cartão de cada idioma forma a tentativa. Tocar outro cartão do mesmo idioma troca a seleção.
- Acerto: os dois cartões saem e um novo par entra. Erro: os cartões ficam, a seleção é limpa, a resposta não é revelada.
- O tempo de resposta vai da primeira seleção até a que fecha o par (medição versão 2 do site). Corrigido depois da tarefa, em 2026-11-12; a primeira versão media desde a entrada do par.
- `onReady` é chamado uma vez, quando os primeiros cartões podem ser tocados. `onPairsEntered` é chamado a cada reposição. `onAttempt` não é aguardado.
- `disabled` bloqueia novas seleções.
- Acerto e erro são diferentes por texto ou ícone, além da cor, e anunciados ao leitor de tela.
- Cada cartão tem nome, idioma e estado selecionado para o leitor de tela. Alvos de pelo menos 44 por 44 pontos. Sem rolagem para jogar.
- Com redução de movimento ativa, a animação é reduzida.
- Visual segue a paleta e as métricas da entrada.
</requirements>

## Subtarefas

- [x] 4.1 Escrever os testes de unidade que falham para `pair-board-state`: seleção, troca, acerto com reposição, erro sem revelar, `onReady` uma vez, tempo de resposta, bloqueio por `disabled`.
- [x] 4.2 Implementar `pair-board-state.ts` como redutor puro.
- [x] 4.3 Implementar `pair-board.tsx` com rótulos de acessibilidade, anúncios e redução de movimento.
- [x] 4.4 Testar a fronteira: o componente não importa composição, repositório nem pontuação.
- [x] 4.5 Refatorar até os testes passarem.

## Detalhes de Implementação

Ver `techspec.md`: Interfaces Principais (`PairBoardProps`), Decisões Principais (o tabuleiro não grava) e Pontos de Integração (`AccessibilityInfo` por import estático).

Referência, somente leitura: `/home/psgvaz/Projetos/app-english/lib/presentation/game/board-reducer.ts` (sem as fases de rede) e `/home/psgvaz/Projetos/app-english/components/game/game-board.tsx` (visual e acessibilidade). O estilo visual segue `src/components/home/` e `src/components/challenge/challenge-screen.tsx`.

## Critérios de Sucesso

- Nenhum código do tabuleiro decide acerto fora de `resolveBoardSelection`.
- O tabuleiro nunca mostra mais de 5 pares.
- Os rótulos de acessibilidade dizem idioma, texto e estado.

## Testes da Tarefa

- [x] Testes de unidade: redutor do tabuleiro e textos de feedback e acessibilidade.
- [x] Testes de integração: uma sequência de 20 acertos com erros intercalados pelo redutor esvazia a fila, chama `onAttempt` em ordem e `onReady` uma vez.
- [x] Testes E2E: não se aplicam. Não há Playwright neste aplicativo.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/lib/presentation/game/pair-board-state.ts`
- `src/components/game/pair-board.tsx`
- `src/lib/domain/game/game-engine.ts`
- `tests/unit/presentation/game/pair-board-state.test.ts`
