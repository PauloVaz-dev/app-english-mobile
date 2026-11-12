# Tarefa 1.0: Regras de vocabulário copiadas do site

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Trazer do site as regras do texto da palavra e da duplicata. Tudo em memória. Ainda não há banco, composição nem tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Copiar sem mudar regra: `vocabulary-text.ts`, `vocabulary-key.ts` e `vocabulary-entry.ts`. O repositório `app-english` não é editado.
- `index.ts` exporta só o que este app usa. `import-parser.ts` não entra.
- Inglês e português obrigatórios; só espaço é vazio. Limite de 80 caracteres depois de tirar espaços das pontas e juntar os repetidos.
- Frase opcional, limite de 240; vazia ou só espaço vira ausente, não erro.
- Inglês e português inválidos juntos geram os dois erros.
- A chave de duplicata ignora maiúscula, acento e espaço: "maçã" = "maca", "New York" = "newyork". Inglês igual com português diferente, ou o contrário, é outra chave.
- `findDuplicateEntry` encontra a duplicata também entre entradas inativas.
- O texto guardado mantém acento e maiúscula.
- Nenhum arquivo desta tarefa importa Expo, React Native ou banco.
</requirements>

## Subtarefas

- [x] 1.1 Copiar os testes do site (`vocabulary-text.test.ts`, `vocabulary-key.test.ts`) e vê-los falhar por falta dos módulos.
- [x] 1.2 Escrever os testes que faltam para os casos do PRD: 80 e 81, 240 e 241, frase só com espaço, os dois erros juntos, os pares de duplicata do PRD, duplicata de entrada inativa.
- [x] 1.3 Copiar os módulos de domínio e montar `index.ts` sem a importação.
- [x] 1.4 Acrescentar o teste de fronteira: `src/lib/domain/vocabulary` não importa Expo, React Native nem banco.
- [x] 1.5 Rodar a suíte inteira e refatorar só imports, sem tocar regra.

## Detalhes de Implementação

Ver `techspec.md`: Visão Geral dos Componentes e Decisões Principais (regras copiadas, não reescritas).

Origem da cópia, somente leitura:
- `/home/psgvaz/Projetos/app-english/lib/domain/vocabulary/vocabulary-text.ts`, `vocabulary-key.ts`, `vocabulary-entry.ts`, `index.ts` (referência)
- Testes: `/home/psgvaz/Projetos/app-english/tests/unit/domain/vocabulary/vocabulary-text.test.ts` e `vocabulary-key.test.ts`

## Critérios de Sucesso

- Os testes copiados do site passam sem edição de regra.
- Todos os casos extremos de texto e duplicata do PRD têm teste.
- `npx tsc --noEmit` sem erros e nenhum erro novo em `npx expo lint`.

## Testes da Tarefa

- [x] Testes de unidade: texto, chave, entidade, duplicata e fronteira de imports.
- [x] Testes de integração: uma lista em memória com o vocabulário inicial recusa as variações de maiúscula, acento e espaço de uma palavra existente e aceita um par com só um dos lados igual.
- [x] Testes E2E: não se aplicam. Não há tela nem banco.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/lib/domain/vocabulary/vocabulary-text.ts`
- `src/lib/domain/vocabulary/vocabulary-key.ts`
- `src/lib/domain/vocabulary/vocabulary-entry.ts`
- `src/lib/domain/vocabulary/index.ts`
- `tests/unit/domain/vocabulary/`
- `prisma/seed-data.ts` (somente leitura, para o teste de integração)
