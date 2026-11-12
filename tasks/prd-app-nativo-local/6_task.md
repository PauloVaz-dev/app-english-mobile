# Tarefa 6.0: Entrada e destinos indisponíveis

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

A primeira tela passa a ser o resumo do dia. A pessoa vê quantas palavras vencem hoje, quantas novas ainda cabem e, quando não há pendência, a data da próxima revisão. Revisão, treino livre, desafio e palavras abrem uma tela curta dizendo que a atividade ainda não está disponível. A entrada atual de login do clone deixa de ser a tela inicial.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- `HomeComposition.load` executa migração, aluno, semente, fuso e `GetDailyReviewSummary`, e devolve `HomeReviewSummaryView`.
- A rota inicial mostra esse texto. A ação principal navega para a revisão.
- As rotas de revisão, treino livre, desafio e palavras anunciam que a atividade ainda não está disponível e oferecem volta.
- Falha de migração, semente ou resumo mostra erro com ação de tentar de novo e registra o evento local citado na techspec.
- Alvos principais com pelo menos 44 por 44 pontos, nome para leitor de tela, e o resumo anunciado como texto.
- Não adicionar teste de interface. A techspec limita o automatizado ao Vitest e ao SQLite.
</requirements>

## Subtarefas

- [x] 6.1 Escrever o teste de unidade que falha enquanto a composição não transforma o resumo na view já existente.
- [x] 6.2 Escrever o teste de integração que falha enquanto `load` não devolve o resumo do arquivo SQLite depois de duas chamadas.
- [x] 6.3 Implementar `HomeComposition` e substituir a rota inicial.
- [x] 6.4 Criar as quatro rotas de destino indisponível e o estado de erro com tentar de novo.
- [x] 6.5 Refatorar até os testes passarem sem implementar revisão, jogo, desafio ou cadastro.

## Detalhes de Implementação

Ver `techspec.md`: fluxo da `HomeComposition`, Endpoints de API (não há), Monitoramento e Observabilidade e Arquivos relevantes.

A view pronta é `toHomeReviewSummaryView`. Não reescrever as frases do resumo. A tela usa os primitivos do React Native, como a techspec decide.

## Critérios de Sucesso

- Duas chamadas de `load` no mesmo arquivo e no mesmo instante devolvem o mesmo resumo e o mesmo aluno.
- A rota inicial não é mais a tela de login do clone.
- Cada destino secundário abre a mensagem de indisponível e volta para a entrada.
- Erro de abertura não apaga `english.db` e permite tentar de novo.
- Nenhuma atividade de estudo (digitar, parear, desafiar, cadastrar) é implementada nesta task.

## Testes da Tarefa

- [x] Testes de unidade: composição com reader falso produz `HomeReviewSummaryView`, inclusive o estado sem pendência.
- [x] Testes de integração: `load` contra o SQLite de teste devolve o resumo da tarefa 5.0 nas duas aberturas.
- [x] Testes E2E: não se aplicam. A techspec exclui Playwright e teste de interface nesta entrega.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/composition/home.ts`
- `src/app/index.tsx`
- `src/app/revisar.tsx`
- `src/app/treino-livre.tsx`
- `src/app/desafio.tsx`
- `src/app/palavras.tsx`
- `src/lib/presentation/review/home-review-copy.ts`
