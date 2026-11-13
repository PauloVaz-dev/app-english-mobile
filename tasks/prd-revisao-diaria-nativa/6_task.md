# Tarefa 6.0: Tela da revisão

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Substituir o aviso de atividade indisponível em `/revisar` pela sessão: etapa de digitação com o cartão da tarefa 5.0, etapa de pareamento com o `PairBoard`, resultado e o estado "nada para revisar". A entrada passa a mostrar os números atualizados ao voltar.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- A rota `src/app/revisar.tsx` deixa de usar `UnavailableActivity`. "Revisar hoje" abre a sessão direto.
- A tela mostra a etapa atual e o progresso da sessão. Etapa vazia é pulada.
- A digitação usa o cartão da tarefa 5.0; o pareamento usa o `PairBoard` com `key` da partida e grava exposição e tentativa pela composição.
- Falha ao gravar mostra "Tentar de novo" e reenvia pelo mesmo `attemptId`.
- O resultado mostra acertos, erros, quantas ainda vencem hoje e a data da próxima revisão, com ação de continuar (se ainda houver vencidas) e de voltar à entrada.
- Sem vencidas e sem novas, a tela diz que não há nada para revisar e oferece o treino livre.
- Sair da rota abandona a sessão; as notas dadas ficam.
- A entrada relê o resumo do dia ao voltar ao foco.
- Uma única composição por sessão. A lógica da tela fica em módulo puro, fora de `src/app/`.
</requirements>

## Subtarefas

- [x] 6.1 Escrever os testes de unidade que falham para `review-screen`: etapas, pulo de etapa vazia, progresso, falha com "Tentar de novo", resultado, continuar, nada para revisar.
- [x] 6.2 Escrever o teste de integração que falha: sair no meio grava `ABANDONED` e preserva as notas; uma sessão completa grava as agendas e o resultado bate com o banco.
- [x] 6.3 Implementar `review-screen.ts` e `review-screen.tsx`.
- [x] 6.4 Ligar a rota `/revisar` e a releitura do resumo na entrada.
- [x] 6.5 Refatorar até os testes passarem e conferir que o bundle Android compila.

## Detalhes de Implementação

Ver `techspec.md`: fluxo em Visão Geral dos Componentes, Monitoramento e Decisões Principais. Padrões de tela: `src/components/game/practice-screen.tsx` e `src/components/challenge/challenge-screen.tsx`.

## Critérios de Sucesso

- `/revisar` não mostra mais o texto de atividade indisponível.
- Uma sessão vai da entrada ao resultado no aparelho, com as duas etapas.
- Depois da sessão, a entrada mostra os números novos.
- A entrada continua com as mesmas quatro ações.

## Testes da Tarefa

- [x] Testes de unidade: estados e textos da tela com composição falsa.
- [x] Testes de integração: abandono e sessão completa pela composição contra o SQLite de teste.
- [x] Testes E2E: não se aplicam. A verificação no aparelho é manual, num development build.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/app/revisar.tsx`
- `src/lib/presentation/review/review-screen.ts`
- `src/components/review/review-screen.tsx`
- `src/components/review/typing-card.tsx`
- `src/components/game/pair-board.tsx`
- `src/components/home/home-entry-screen.tsx`
- `tests/unit/presentation/review/review-screen.test.ts`
- `tests/integration/composition/review-screen.test.ts`
