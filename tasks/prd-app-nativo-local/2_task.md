# Tarefa 2.0: Banco SQLite na versão 1

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Abrir um arquivo SQLite local e criar, numa única migração, o schema equivalente ao Prisma do produto. As tasks de aluno, semente e resumo gravam e leem nesse arquivo. Nenhuma tela muda nesta task.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- O arquivo se chama `english.db` e usa o diretório padrão do `expo-sqlite`.
- A migração 1 cria as doze tabelas, as chaves únicas, as chaves estrangeiras e os índices citados na techspec.
- `PRAGMA user_version = 1` ocorre na mesma transação das tabelas.
- `foreign_keys` e `WAL` são ligados fora dessa transação.
- Schema mais novo do que o aplicativo suporta gera erro e não apaga o arquivo.
- O mesmo SQL roda no `expo-sqlite` e no `better-sqlite3` por um executor mínimo.
</requirements>

## Subtarefas

- [x] 2.1 Escrever o teste de integração que falha enquanto o arquivo novo não estiver na versão 1 com as doze tabelas.
- [x] 2.2 Escrever o teste de unidade que falha quando a versão gravada é maior do que a suportada e espera erro, sem exclusão do arquivo.
- [x] 2.3 Implementar o executor e a migração descritos na techspec.
- [x] 2.4 Repetir a abertura do mesmo arquivo e confirmar que a migração não roda de novo.
- [x] 2.5 Refatorar até os dois testes passarem sem mudar o SQL já coberto.

## Detalhes de Implementação

Ver `techspec.md`: Modelos de Dados, Pontos de Integração, Abordagem de Testes e a decisão de não usar Drizzle nem Prisma no aparelho.

A lista de tabelas e os `ON DELETE` acompanham `prisma/schema.prisma`, copiado na tarefa 1.0. Não editar a migração 1 depois que ela existir: mudança futura é versão 2.

## Critérios de Sucesso

- Um arquivo novo fica com `user_version` 1 e as doze tabelas.
- Abrir de novo não duplica tabela nem muda a versão.
- Versão maior que 1 interrompe a abertura com erro e preserva o arquivo.
- O teste usa `better-sqlite3`. O aplicativo usa o mesmo SQL via `expo-sqlite`.

## Testes da Tarefa

- [x] Testes de unidade: versão de schema mais nova falha sem apagar o banco.
- [x] Testes de integração: migração 1 no `better-sqlite3` cria tabelas, chaves e versão, e a segunda abertura é estável.
- [x] Testes E2E: não se aplicam. Não há tela nem servidor.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `prisma/schema.prisma`
- `src/persistence/migrate.ts`
- `tests/integration/persistence/sqlite-daily-summary.test.ts` (a parte de schema; as contagens entram na tarefa 5.0)
