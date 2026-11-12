# Tarefa 7.0: Layout da entrada

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

A entrada já mostra o resumo e os quatro destinos, mas a tela é uma lista de botões. Esta task troca essa lista por um layout de abertura no celular, no espírito da entrada do site: uma frase de apresentação, um cartão com a revisão de hoje e as ações dentro desse cartão. Os números continuam sendo os da tarefa 6.0. Nenhuma atividade de estudo é implementada.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- A rota inicial deixa de ser só título e botões empilhados. Ela passa a ter, de cima para baixo: um selo, um título de duas linhas, uma frase curta e um cartão.
- O selo diz "Vocabulário que fica".
- O título diz "Treine palavras." e, na linha seguinte, "Lembre de verdade."
- A frase diz que a pessoa revisa o que venceu hoje, conhece poucas palavras novas e treina no próprio ritmo, sem cadastro.
- O cartão tem o rótulo "Revisão de hoje" e, logo abaixo, a contagem real vinda de `HomeReviewSummaryView`. Com pendência, o texto é o de `formatReviewCounts`. Sem pendência, o cartão mostra "Nada para revisar hoje" e a data da próxima revisão, quando existir.
- Dentro do cartão, "Revisar hoje" é o único botão preenchido. "Treino livre", "Desafio" e "Palavras" ficam abaixo, como ações secundárias, e continuam indo para as rotas já existentes.
- O layout cabe na largura do celular, com rolagem se precisar. Não há coluna ao lado com o desenho do tabuleiro.
- O resumo anunciado para o leitor de tela permanece o da tarefa 6.0. Alvos principais continuam com pelo menos 44 por 44 pontos.
- Carregando e erro continuam visíveis, dentro do mesmo fundo da entrada, com a ação "Tentar de novo" no erro.
- Não mudar a composição, o banco nem as frases calculadas do resumo.
</requirements>

## Subtarefas

- [x] 7.1 Escrever o teste de unidade que falha enquanto a view da entrada não descreve selo, título, frase, cartão e as quatro ações, com a contagem real no cartão.
- [x] 7.2 Escrever o teste de integração que falha enquanto a tela pronta não recebe o resumo já gravado no SQLite da tarefa 6.0.
- [x] 7.3 Montar o layout na rota inicial, usando a view e o resumo que já existem.
- [x] 7.4 Ajustar carregamento e erro para o mesmo fundo, sem esconder o botão de tentar de novo.
- [x] 7.5 Refatorar até os testes passarem sem desenhar o tabuleiro e sem alterar `toHomeReviewSummaryView`.

## Detalhes de Implementação

A estrutura e os textos de apresentação estão nesta task. A contagem, o estado vazio e a navegação continuam na tarefa 6.0 e em `techspec.md`, na `HomeComposition` e em `toHomeReviewSummaryView`.

A referência visual é a entrada do site: selo, título, frase e cartão com o resumo e o botão principal. No celular esses blocos ficam um embaixo do outro. A ilustração do tabuleiro ao lado do texto fica de fora.

## Critérios de Sucesso

- Abrir a entrada mostra selo, título, frase e cartão antes dos destinos secundários.
- O cartão mostra a mesma contagem que `formatReviewCounts` devolveria para aquele resumo, ou o estado sem pendência.
- "Revisar hoje" é visualmente a ação principal. As outras três ações não usam o mesmo preenchimento.
- A ilustração do jogo não ocupa a tela.
- O resumo do SQLite não muda por causa desta task.

## Testes da Tarefa

- [x] Testes de unidade: a view da entrada descreve os blocos e coloca a contagem, ou o estado vazio, dentro do cartão.
- [x] Testes de integração: a entrada pronta usa o resumo carregado do SQLite, sem uma contagem fixa.
- [ ] Testes E2E: não se aplicam. Não há servidor nem Playwright nesta entrega.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/app/index.tsx`
- `src/components/home/home-entry-screen.tsx`
- `src/lib/presentation/review/home-review-copy.ts`
- `src/composition/home.ts`
