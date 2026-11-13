# Tarefa 1.0: Regras da revisão copiadas do site

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Trazer do site as regras que faltam: a sessão de revisão, a correção da digitação com "quase", a nota da digitação e a nota do pareamento. Tudo em memória, com relógio falso. Ainda não há banco, composição nem tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Copiar sem mudar regra: `lib/domain/review/` (`review-session.ts`, `errors.ts`, `index.ts`), `typing-answer.ts`, `typing-review.ts` e `matching-review.ts`. O repositório `app-english` não é editado.
- Instalar `fastest-levenshtein` com `npm install` (não é módulo Expo). É JavaScript puro e não exige development build.
- `review-schedule.ts` e `daily-review-plan.ts` já estão no app, iguais aos do site: reutilizar, não copiar de novo.
- Comparação da digitação ignora maiúscula, acento, espaços nas pontas e repetidos.
- Uma letra trocada, faltando ou sobrando é "quase" (Difícil), só com 4 letras ou mais. Outra diferença é erro (Errei). "Não sei" é Errei. Acerto com dica é no máximo Difícil. Acerto sem dica segue o tempo: acima de 5 s Difícil, de 2 a 5 s Bom, abaixo de 2 s Fácil.
- A nota da palavra na sessão é a da primeira tentativa; o reforço depois de um erro não muda a nota.
- No pareamento, a nota máxima é Bom; o último par da partida é no máximo Difícil; palavra que não vence hoje (distratora) não recebe nota.
- Nenhum arquivo desta tarefa importa Expo, React Native ou banco.
</requirements>

## Subtarefas

- [x] 1.1 Copiar os testes do site (`review-session.test.ts`, `typing-answer`, `typing-review`, `matching-review`) e vê-los falhar por falta dos módulos.
- [x] 1.2 Escrever os testes que faltam para os casos do PRD listados em Requirements.
- [x] 1.3 Instalar `fastest-levenshtein` e copiar os módulos, ajustando só caminhos.
- [x] 1.4 Acrescentar o teste de fronteira: `src/lib/domain/review` e os novos arquivos de `learning` não importam Expo, React Native nem banco.
- [x] 1.5 Rodar a suíte inteira e refatorar só imports, sem tocar regra.

## Detalhes de Implementação

Ver `techspec.md`: Visão Geral dos Componentes (cópias do site), Pontos de Integração (`fastest-levenshtein`) e Decisões Principais.

Origem da cópia, somente leitura:
- `/home/psgvaz/Projetos/app-english/lib/domain/review/`
- `/home/psgvaz/Projetos/app-english/lib/domain/learning/typing-answer.ts`, `typing-review.ts`, `matching-review.ts`
- Testes: `/home/psgvaz/Projetos/app-english/tests/unit/domain/review/review-session.test.ts` e `/home/psgvaz/Projetos/app-english/tests/unit/domain/learning/{typing-answer,typing-review,matching-review}.test.ts`

## Critérios de Sucesso

- Os testes copiados do site passam sem edição de regra.
- `npx tsc --noEmit` e `npx expo lint` sem erros.
- Nenhum arquivo de `src/lib/domain` importa Expo, React Native ou banco.

## Testes da Tarefa

- [x] Testes de unidade: sessão de revisão, correção da digitação, notas das duas etapas e fronteira de imports.
- [x] Testes de integração: uma sessão em memória com digitação e pareamento, incluindo erro com reforço, dica, "não sei" e o último par, produz as notas e as agendas esperadas por `scheduleReview`.
- [x] Testes E2E: não se aplicam. Não há tela nem banco.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/lib/domain/review/review-session.ts`
- `src/lib/domain/review/errors.ts`
- `src/lib/domain/review/index.ts`
- `src/lib/domain/learning/typing-answer.ts`
- `src/lib/domain/learning/typing-review.ts`
- `src/lib/domain/learning/matching-review.ts`
- `src/lib/domain/learning/review-schedule.ts` (reutilizado)
- `package.json`
- `tests/unit/domain/review/`
- `tests/unit/domain/learning/`
