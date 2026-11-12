# Tarefa 3.0: Aluno único e vocabulário inicial

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Na primeira abertura, o aplicativo cria um aluno local e insere as 32 palavras iniciais. Na segunda abertura, o mesmo aluno e as mesmas palavras continuam lá. Texto já gravado não é reescrito. Ainda não há resumo nem tela nova.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Existindo zero alunos, inserir um, com id de `expo-crypto`.
- Existindo um ou mais, devolver o mais antigo e não inserir outro.
- Inserir cada entrada de `vocabularySeed` só quando o par normalizado ainda não existe.
- Não atualizar inglês, português nem frase de linha já presente.
- Depende do banco da tarefa 2.0 e da semente copiada na tarefa 1.0.
</requirements>

## Subtarefas

- [x] 3.1 Escrever os testes de unidade que falham: segunda garantia devolve o mesmo id; segunda semente não duplica e não altera texto.
- [x] 3.2 Escrever o teste de integração que falha enquanto o arquivo não tiver um aluno e 32 palavras depois de duas aberturas.
- [x] 3.3 Implementar `LocalLearner` e a semente idempotente.
- [x] 3.4 Ligar os dois à migração, sem calcular o resumo do dia.
- [x] 3.5 Refatorar até os testes passarem sem acrescentar atualização de texto na semente.

## Detalhes de Implementação

Ver `techspec.md`: Interfaces Principais (`LearnerStore`), Modelos de Dados (semente só insere o que falta) e Decisões Principais (a semente não faz upsert com atualização).

As 32 entradas e `normalizeVocabularyText` vêm de `prisma/seed-data.ts`.

## Critérios de Sucesso

- Duas aberturas do mesmo arquivo produzem um aluno e 32 palavras.
- Uma palavra cujo texto foi alterado no banco permanece alterada depois de semear de novo.
- Não existe fluxo para trocar de aluno.

## Testes da Tarefa

- [x] Testes de unidade: aluno idempotente com gerador de id falso; semente não duplica e não sobrescreve.
- [x] Testes de integração: duas aberturas do mesmo arquivo SQLite mantêm um aluno e 32 linhas em `Word`.
- [x] Testes E2E: não se aplicam. A entrada visual é a tarefa 6.0.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/identity/local-learner.ts`
- `src/seed/seed-vocabulary.ts`
- `prisma/seed-data.ts`
- `src/persistence/migrate.ts`
