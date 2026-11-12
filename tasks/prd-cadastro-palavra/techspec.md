# Especificação Técnica — Cadastro de palavra

## Resumo Executivo

O cadastro roda no aplicativo local, sobre o `english.db` da fundação, e substitui o aviso de atividade indisponível na rota `/palavras`. As regras vêm do site `app-english`, copiadas sem mudança: limpeza e limites do texto (`vocabulary-text.ts`), chave de duplicata que ignora acento, maiúscula e espaço (`vocabulary-key.ts`) e a entidade com o erro de duplicata (`vocabulary-entry.ts`). O repositório Prisma do site vira um repositório SQLite sobre o executor e a transação da fundação.

A gravação acontece numa transação: lê o catálogo inteiro, procura a chave de duplicata e só então insere a linha em `Word`, ativa e sem `LearnerWordProgress`. A palavra fica disponível como nova para os sorteios que já leem o catálogo ativo. A tela é um formulário de três campos, com `KeyboardAvoidingView` do React Native, sem pacote novo. O estado do formulário fica num módulo puro, testável sem React Native.

## Arquitetura do Sistema

### Visão Geral dos Componentes

Novos:

- `src/lib/domain/vocabulary/vocabulary-text.ts`: limpa espaços, aplica os limites de 80 e 240 caracteres e devolve todos os erros por campo. Cópia do site.
- `src/lib/domain/vocabulary/vocabulary-key.ts`: chave de duplicata (NFKD, sem marcas combinantes, minúscula, sem espaço). Cópia.
- `src/lib/domain/vocabulary/vocabulary-entry.ts`: `VocabularyEntry`, `DuplicateVocabularyError` e `findDuplicateEntry`. Cópia, sem as partes de importação.
- `src/lib/domain/vocabulary/index.ts`: exporta só o que este app usa. O `import-parser.ts` fica de fora.
- `src/lib/application/vocabulary/create-word.ts`: caso de uso. Valida, monta a entrada, procura duplicata e insere dentro da transação. Adaptado do site para a porta deste app.
- `src/persistence/sqlite-vocabulary-repository.ts`: `transaction`, `listAll` e `insert` sobre `Word`.
- `src/composition/word-registration.ts` e `src/composition/installed-word-registration.ts`: composição pura e ligação ao aparelho.
- `src/lib/presentation/vocabulary/word-form.ts`: estado do formulário (campos, erros por campo, aviso de duplicata, sucesso, gravação em andamento, falha) e os textos de acessibilidade.
- `src/components/vocabulary/word-form-screen.tsx`: a tela.

Modificados:

- `src/app/palavras.tsx`: deixa de usar `UnavailableActivity`.

Reutilizados sem mudança: `normalizeVocabularyText` de `prisma/seed-data.ts` (colunas `englishNormalized` e `portugueseNormalized`), executor SQL, `prepareHomeStudy`, `expo-crypto` e a paleta da entrada. A entrada continua com as mesmas quatro ações.

Fluxo: a entrada navega para `/palavras`. A pessoa preenche e toca Adicionar. O módulo da tela valida com `parseVocabularyTexts`; com erro, mostra todos os erros e move o foco para o primeiro campo inválido, sem tocar no banco. Sem erro, chama a composição. Duplicata devolve o inglês e o português gravados. Sucesso limpa os três campos e mostra a mensagem. Outra falha mantém o texto e oferece tentar de novo.

## Design de Implementação

### Interfaces Principais

```ts
// src/lib/application/vocabulary/ports/vocabulary-repository.ts
interface VocabularyStore {
  listAll(): Promise<readonly VocabularyEntry[]>;
  insert(entry: VocabularyEntry): Promise<void>;
}
interface VocabularyRepository {
  transaction<T>(work: (store: VocabularyStore) => Promise<T>): Promise<T>;
}
```

```ts
// src/composition/word-registration.ts
type RegisterWordOutcome =
  | { kind: "created"; word: { id: string; english: string; portuguese: string } }
  | { kind: "invalid"; issues: readonly VocabularyTextIssue[] }
  | { kind: "duplicate"; existing: { english: string; portuguese: string } };

interface WordRegistration {
  register(input: VocabularyTextInput): Promise<RegisterWordOutcome>; // outra falha: rejeita
}
```

`createWordRegistration` recebe repositório, gerador de id e registro de eventos. Ele não importa Expo nem React Native. `installed-word-registration.ts` usa a abertura do banco da fundação e `randomUUID` de `expo-crypto`, com imports estáticos nomeados.

### Modelos de Dados

Não há migração. A linha nova em `Word`:

- `id`: UUID do `expo-crypto`.
- `english`, `portuguese`, `exampleSentence`: texto limpo por `parseVocabularyTexts`, com acento e maiúscula. Frase vazia vira `NULL`.
- `englishNormalized`, `portugueseNormalized`: `normalizeVocabularyText`, a mesma do vocabulário inicial, para manter o índice único `Word_englishNormalized_portugueseNormalized_key`.
- `active = 1`, `updatedAt` do relógio.

Nenhuma linha em `LearnerWordProgress`. A palavra conta como sem histórico, ou seja, nova, nos sorteios que já leem o catálogo ativo.

Há duas comparações e elas não se confundem. A chave do site (`vocabularyKey`) decide a duplicata, inclusive para palavras inativas. A coluna normalizada só alimenta o índice. Como a chave é mais ampla que a coluna, todo par barrado pelo índice já foi barrado pela chave. Mesmo assim, uma violação do índice dentro da transação vira duplicata, lida de novo do banco.

### Endpoints de API

Não se aplica. Não há servidor nem rede.

## Pontos de Integração

- `expo-sqlite` pelo executor e pela transação da fundação.
- `expo-crypto` para o id.
- `KeyboardAvoidingView` e `ScrollView` do React Native, com `behavior="padding"` nas duas plataformas, porque o Android do Expo é edge-to-edge e a janela não se redimensiona com o teclado. `keyboardShouldPersistTaps="handled"` para o botão responder com o teclado aberto.
- `AccessibilityInfo.announceForAccessibility` para sucesso, duplicata e falha. `TextInput` com `accessibilityLabel` ("Inglês, obrigatório", "Português, obrigatório", "Frase de exemplo, opcional") e o erro no `accessibilityHint` do campo, além do texto visível.
- Sem rede e sem pacote novo.

## Abordagem de Testes

A ordem é TDD: teste que falha, implementação mínima, refatoração. Os testes das regras copiadas vêm junto com a cópia e passam sem edição de regra.

### Testes Unidade

- `vocabulary-text` e `vocabulary-key`: testes copiados do site, mais os casos do PRD: só espaço, 80 e 81 caracteres, 240 e 241, frase vazia como ausente, "maçã" e "maca", "New York" e "newyork", maiúscula, inglês igual com português diferente.
- `create-word` com repositório em memória: inválido não chama o repositório, duplicata devolve o texto gravado e não insere, sucesso insere uma linha.
- `word-form`: os dois erros juntos, texto preservado, foco no primeiro campo com erro, sucesso limpa os campos, a mensagem some ao digitar, falha mantém o texto e libera tentar de novo, botão bloqueado durante a gravação, rótulos e anúncios.

Mocks só nas bordas: `expo-crypto` e `react-native` (`AccessibilityInfo`).

### Testes de Integração

No `better-sqlite3`, com o executor da fundação:

- Cadastrar grava uma linha ativa, sem progresso, com as colunas normalizadas; reabrir o arquivo devolve a palavra.
- Duplicata de uma palavra do vocabulário inicial e de uma inativa não cria linha nem altera a existente.
- Falha no meio da transação não deixa linha parcial.
- Uma nova abertura do aplicativo (semeadura) não duplica a palavra cadastrada.
- A palavra cadastrada pode sair em `drawPracticeWords` e `drawChallengeWords` como palavra sem histórico.
- Dez cadastros em sequência, com uma frase e uma duplicata recusada, gravam nove linhas.

### Testes de E2E

Não se aplicam. Não há Playwright neste aplicativo. A verificação no aparelho é manual, num development build.

## Sequenciamento de Desenvolvimento

### Ordem de Construção

1. Cópia do domínio de vocabulário com os testes do site. Não depende de nada.
2. Repositório SQLite e caso de uso `create-word`. Depende de 1.
3. Composição e ligação ao aparelho. Depende de 2.
4. Estado do formulário e tela em `/palavras`. Depende de 1 e 3.

### Dependências Técnicas

Fundação com `english.db` na versão 1 e o aluno local. Nenhum pacote novo e nenhum development build novo.

## Monitoramento e Observabilidade

Não há Prometheus nem Grafana. Nada sai do aparelho. O texto digitado nunca entra em log.

- `words.create_failed`: falha de gravação que não é duplicata nem texto inválido, registrada por `logDeviceEvent` como erro. A tela mostra "Não foi possível salvar. Tente de novo."
- Duplicata e texto inválido não são log: são estados da tela.

## Considerações Técnicas

### Decisões Principais

As regras de texto e de duplicata são copiadas, não reescritas. O PRD exige "as regras já usadas no produto", e os testes do site garantem isso. Só o repositório é reescrito, porque o Prisma não existe aqui.

A duplicata é procurada lendo o catálogo inteiro dentro da transação, como no site. A chave ignora acento e espaço, o que o SQLite não faz sozinho, e uma coluna nova com a chave pediria migração. Com 5.000 palavras, a leitura cabe no limite de resposta da tela; o PRD da fundação já usa esse tamanho como referência.

Palavra inativa conta como duplicata, como no site. Reativar fica com o PRD de vocabulário. Isso também mantém o índice único atual sem mudança.

`KeyboardAvoidingView` nativo, sem `react-native-keyboard-controller`. Três campos não pedem navegação de teclado própria, e um pacote nativo exigiria outro development build.

O formulário não guarda rascunho. Sair da rota ou fechar o aplicativo descarta o que não foi gravado, como pede o PRD.

### Riscos Conhecidos

- Toque duplo em Adicionar. Mitigação: o botão fica bloqueado durante a gravação, e a duplicata barra a segunda tentativa.
- Um anúncio ao leitor de tela pode ser interrompido pelo foco que se move. Mitigação: o foco vai para o campo primeiro e o anúncio vem depois; verificação manual com TalkBack.
- Catálogo muito grande deixa a leitura da duplicata lenta. Aceitável até 5.000 palavras. Acima disso, uma coluna com a chave fica para uma migração futura.

### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica. `src/lib/domain` e `src/lib/application` continuam sem Expo, React Native e acesso ao banco.

### Arquivos relevantes e dependentes

Novos: `src/lib/domain/vocabulary/vocabulary-text.ts`, `src/lib/domain/vocabulary/vocabulary-key.ts`, `src/lib/domain/vocabulary/vocabulary-entry.ts`, `src/lib/domain/vocabulary/index.ts`, `src/lib/application/vocabulary/create-word.ts`, `src/lib/application/vocabulary/ports/vocabulary-repository.ts`, `src/persistence/sqlite-vocabulary-repository.ts`, `src/composition/word-registration.ts`, `src/composition/installed-word-registration.ts`, `src/lib/presentation/vocabulary/word-form.ts`, `src/components/vocabulary/word-form-screen.tsx`.

Modificados: `src/app/palavras.tsx`.

Origem da cópia, somente leitura: `/home/psgvaz/Projetos/app-english/lib/domain/vocabulary/vocabulary-text.ts`, `vocabulary-key.ts`, `vocabulary-entry.ts`, `/home/psgvaz/Projetos/app-english/lib/application/vocabulary/create-word.ts` (referência) e os testes em `/home/psgvaz/Projetos/app-english/tests/unit/domain/vocabulary/` e `/home/psgvaz/Projetos/app-english/tests/unit/application/vocabulary/vocabulary-use-cases.test.ts`.

Reutilizados: `english.db`, migração 1, `normalizeVocabularyText`, `seedVocabulary`, executor SQL, `logDeviceEvent` e a paleta da entrada.

Fora deste repositório: `app-english` inteiro. Fora desta entrega: lista, correção, desativação, reativação e importação, que ficam com `prd-vocabulario-nativo`.
