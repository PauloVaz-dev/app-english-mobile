# Tarefa 1.0: Sessão de 60 segundos e pontuação

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Trazer a pontuação do site e criar a sessão do modo único de 60 segundos. Acerto, erro, prazo, expiração e abandono funcionam em memória, com relógio falso. Ainda não há banco, sorteio nem tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Copiar `scoring.ts` de `app-english` sem mudar a regra. Aquele repositório não é editado.
- Não copiar `levels.ts`, `ATTEMPT_GRACE_MS` nem `EXPIRE_TOLERANCE_MS`.
- O prazo é `startedAt + 60_000`. Tentativa com `now` maior que o prazo é rejeitada e não muda a pontuação.
- Expirar no instante exato conclui. Expirar antes falha.
- Abandonar marca a sessão como abandonada.
- A mesma sequência de acertos e erros produz sempre a mesma pontuação: 100, 110, 120 e, a partir do sexto acerto seguido, 150. Erro zera a sequência e não deixa o total negativo.
- A coluna de nível não existe nesta sessão. O valor `1` só aparece na gravação, na tarefa 2.0.
</requirements>

## Subtarefas

- [x] 1.1 Escrever os testes de unidade que falham para a sequência de pontos, a tentativa 1 ms depois do prazo, a expiração e o abandono.
- [x] 1.2 Escrever o teste de integração em memória que falha enquanto uma rodada completa não devolve o mesmo total de `scoreOutcomes`.
- [x] 1.3 Copiar a pontuação e implementar a sessão de prazo absoluto.
- [x] 1.4 Cobrir o relógio que avança no segundo plano sem mover o instante final.
- [x] 1.5 Refatorar até os testes passarem sem reintroduzir tolerância de rede nem níveis.

## Detalhes de Implementação

Ver `techspec.md`: Resumo Executivo, Interfaces Principais e Decisões Principais (prazo absoluto, tolerância zero, um modo só).

A origem da cópia é `/home/psgvaz/Projetos/app-english/lib/domain/challenge/scoring.ts`.

## Critérios de Sucesso

- Os testes de pontuação do site passam aqui sem edição da fórmula.
- Tentativa depois do zero não entra na sessão.
- Não há pausa: o prazo continua sendo o mesmo instante quando o relógio de teste simula a volta do segundo plano.
- Nenhum arquivo desta task importa Expo, React Native ou banco.

## Testes da Tarefa

- [x] Testes de unidade: pontos, tentativa atrasada, expiração, abandono e prazo estável.
- [x] Testes de integração: rodada em memória com várias tentativas devolve o total da pontuação copiada.
- [x] Testes E2E: não se aplicam. Não há tela nem servidor.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/lib/domain/challenge/scoring.ts`
- `src/lib/domain/challenge/fixed-challenge.ts`
- `tests/unit/domain/challenge/fixed-challenge.test.ts`
