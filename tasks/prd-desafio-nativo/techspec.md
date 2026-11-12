# Especificação Técnica — Desafio de 60 segundos

## Resumo Executivo

O desafio roda no aplicativo local, sobre o `english.db` da fundação. A pontuação copiada do site permanece. A sessão deixa de usar a escada de cinco níveis e a tolerância de rede: é um modo fixo de 60 segundos, o prazo é um instante absoluto e tentativa depois desse instante não entra.

A tela do desafio substitui o placeholder de `src/app/desafio.tsx`. O tabuleiro não é desenhado aqui. Esta entrega chama a porta de pareamento que a especificação de `prd-jogo-pareamento-nativo` ainda vai definir. Até essa porta existir, sessão, pontuação e recorde são testáveis sem tela de cartões.

## Arquitetura do Sistema

### Visão Geral dos Componentes

- `src/lib/domain/challenge/scoring.ts`: cópia de `pointsForStreak`, `applyOutcome` e `scoreOutcomes`. Sem alteração.
- `src/lib/domain/challenge/fixed-challenge.ts`: sessão do modo único. Prazo, tentativa, expiração e abandono. Não importa `levels.ts`.
- `src/persistence/sqlite-challenge-repository.ts`: grava sessão, palavras da sessão e tentativas nas tabelas já criadas na migração 1.
- `src/persistence/sqlite-word-catalog.ts`: implementa só `drawChallengeWords`, lendo o catálogo ativo e o progresso para sortear. Não grava progresso nem agenda.
- `src/speech/device-speech.ts`: pronúncia do inglês no acerto, via `expo-speech`.
- `src/composition/challenge.ts`: abre, começa, registra, expira, abandona e monta o resultado com o recorde.
- `src/app/desafio.tsx`: introdução, rodada e resultado. A área dos cartões recebe a porta do jogo.
- Porta `PairBoard`, definida em `prd-jogo-pareamento-nativo`: mostra até cinco pares, comunica a tentativa e avisa quando os primeiros cartões podem ser tocados.

Fluxo: a entrada navega para a introdução. Começar sorteia as palavras, grava a sessão e pede o tabuleiro. Quando os cartões podem ser tocados, a sessão marca `startedAt` e o prazo `startedAt + 60_000`. Cada tentativa passa pela sessão antes de pontuar. O relógio da tela só desenha `deadline - now`. Sair da rota abandona. Ir para segundo plano não abandona e não pausa. Ao voltar, o restante é recalculado. No zero, a sessão expira, a tela mostra que o tempo acabou e só então o resultado.

A cópia vem de `app-english` e aquele repositório não é editado. `levels.ts`, `ATTEMPT_GRACE_MS` e `EXPIRE_TOLERANCE_MS` não entram neste aplicativo.

## Design de Implementação

### Interfaces Principais

```ts
interface ChallengeComposition {
  start(visitorId: string): Promise<ChallengeRound>;
  begin(challengeId: string, now: Date): Promise<void>;
  attempt(input: ChallengeAttemptInput, now: Date): Promise<ChallengeRound>;
  expire(challengeId: string, now: Date): Promise<ChallengeResult>;
  abandon(challengeId: string, now: Date): Promise<void>;
  result(challengeId: string): Promise<ChallengeResult>;
}
```

`start` sorteia até 40 palavras ativas, sem repetir, pela seleção de desafio já existente. Com zero palavras ativas, falha com o estado de catálogo insuficiente e não cria sessão. `begin` grava `startedAt` uma vez. `attempt` rejeita `now` maior que o prazo, é idempotente pelo `attemptId` e não chama repositório de progresso nem de revisão. `expire` conclui no instante do prazo. `abandon` marca `ABANDONED` e não altera recorde. `result` calcula a precisão pelas tentativas aceitas e compara a pontuação com o maior `score` das sessões `COMPLETED` anteriores do mesmo aluno. Empate não é recorde novo. A primeira sessão concluída é o recorde.

A coluna `level` permanece no schema e recebe `1`. Esse valor não desbloqueia outro modo nem muda duração ou pares.

### Modelos de Dados

Não há migração nova. A versão 1 já tem `ChallengeSession`, `ChallengeSessionWord` e `ChallengeAttempt`.

`ChallengeSession` guarda aluno, `level = 1`, status, pontuação, maior sequência, acertos, erros, criação, início e fim. O prazo não é uma coluna: é `startedAt + 60_000`. `ChallengeAttempt` guarda `attemptId` único, as duas palavras, o acerto e o instante. Instante posterior ao prazo não é inserido.

O recorde é `MAX(score)` das sessões `COMPLETED` daquele aluno. Sessão abandonada fica de fora da consulta.

### Endpoints de API

Não há endpoints. A tela chama `ChallengeComposition` no processo. Nada sai do aparelho.

## Pontos de Integração

- SQLite local da fundação. Falha de gravação mantém a sessão anterior e mostra erro com tentar de novo. O arquivo não é apagado.
- `AppState`: em `active`, a tela relê o prazo. O `setInterval` só redesenha. Não há pausa.
- `expo-speech`: no acerto, `Speech.speak` com o inglês e `language: "en-US"`. `onError` é ignorado. A chamada não é esperada antes da reposição. Não chamar `getAvailableVoicesAsync`, que pode não retornar quando o motor de voz falta.
- Porta `PairBoard` do jogo de pareamento. Sem essa porta, a rodada visual não é ligada. A sessão e o repositório não dependem dela.
- Não há rede, conta nem áudio externo.

## Abordagem de Testes

A ordem é TDD: teste que falha, implementação mínima, refatoração. Os testes de `scoring.ts` são copiados e devem passar sem edição de regra.

### Testes Unidade

- Sequência de acertos e erros produz 100, 110, 120 e, a partir do sexto acerto seguido, 150. Erro zera a sequência e não deixa a pontuação negativa.
- Tentativa 1 ms depois do prazo é rejeitada e não muda a pontuação. Não existe tolerância de 3 segundos.
- Expirar no instante exato conclui. Expirar antes do prazo falha.
- Abandonar não entra no recorde. Empatar o maior score concluído não é recorde novo.
- O instante final não muda quando o teste simula uma volta do segundo plano depois de parte dos 60 segundos.

### Testes de Integração

No `better-sqlite3`, com o mesmo executor da fundação: uma sessão concluída grava tentativas e o recorde; reabrir o arquivo devolve o mesmo resultado; uma abandonada não muda o recorde; as tabelas de progresso e de agenda permanecem iguais depois das tentativas. Catálogo vazio não cria sessão.

### Testes de E2E

Playwright não se aplica. Não há servidor, e o tabuleiro ainda não tem especificação. O ciclo gravar e reabrir fica no teste de integração do SQLite.

## Sequenciamento de Desenvolvimento

### Ordem de Construção

1. Copiar e testar a pontuação. Ela não depende de tela nem de banco.
2. Sessão de 60 segundos com prazo absoluto, sem graça e sem níveis.
3. Repositório SQLite e o teste de recorde e de separação do progresso.
4. Composição, incluindo o sorteio somente leitura.
5. Fala do aparelho, isolada para o erro não chegar na sessão.
6. Tela de introdução, urgência dos dez segundos finais, fim perceptível e resultado. A área de cartões fica atrás da porta do jogo.
7. Trocar o placeholder da fundação por essa rota, mantendo a revisão e o treino de 20 palavras como caminhos distintos.

A etapa 6 espera a porta descrita em `prd-jogo-pareamento-nativo`. As etapas 1 a 5 não esperam.

### Dependências Técnicas

Fundação com `english.db` na versão 1 e um aluno local. `npx expo install expo-speech` neste repositório. A porta de pareamento, quando a especificação do jogo existir. Nenhum serviço externo.

## Monitoramento e Observabilidade

Não há Prometheus nem Grafana. Nada é enviado para fora.

Erro de voz registra `challenge.speech_failed` e a rodada continua. Falha ao gravar registra `challenge.persist_failed`. Expiração e abandono não geram log de sucesso.

## Considerações Técnicas

### Decisões Principais

Um modo só, com até cinco pares visíveis e um recorde. A escada do site, as metas de 800 a 1.600 e as durações de 45 e 40 segundos ficam de fora. A coluna `level` recebe `1` porque o schema já existe. Ela não vira seletor.

O prazo é a fonte do tempo. Intervalo de tela e animação não contam os 60 segundos. Isso evita o atraso do JavaScript quando o aplicativo está em segundo plano. Sair da rota abandona. Segundo plano deixa o prazo correr.

A tolerância de 3 segundos e a folga de 2 segundos do site existem para o relógio do navegador contra o servidor. Aqui o mesmo processo grava e decide. As duas constantes ficam em zero ao não serem copiadas.

O tabuleiro não é reimplementado. Duplicar acerto, erro e reposição criaria a segunda regra que o PRD recusa.

O sorteio usa primeiro as palavras ativas estudadas, pela seleção de desafio copiada do site, e completa até 40 com palavras ativas ainda não estudadas, em ordem aleatória. A função do site recusava catálogo sem palavra estudada; como a agenda ainda não é gravada no aplicativo, o desafio nunca abriria. Só zero palavras ativas leva ao catálogo insuficiente. Decisão de 2026-11-12, depois da tarefa 3.0.

O recorde é a consulta do maior score concluído, não uma coluna solta. Abandono fica de fora sem uma segunda escrita.

### Riscos Conhecidos

A porta do jogo ainda não existe. A mitigação é limitar esta entrega, até a etapa 6, a domínio, banco e composição.

Copiar `ChallengeSession` inteira traria níveis e tolerância. A mitigação é uma sessão nova e curta que reutiliza só `scoring.ts`.

`Speech.speak` pode falhar em silêncio no Android se o motor de voz morrer. `onError` não segura a rodada, e o resultado não depende do áudio.

O `setInterval` em segundo plano não dispara. Por isso a volta ao primeiro plano recalcula o prazo antes de aceitar toque.

### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica. `src/lib/domain` continua sem Expo, React Native e acesso ao banco.

### Arquivos relevantes e dependentes

Novos: `src/lib/domain/challenge/scoring.ts`, `src/lib/domain/challenge/fixed-challenge.ts`, `src/persistence/sqlite-challenge-repository.ts`, `src/persistence/sqlite-word-catalog.ts`, `src/speech/device-speech.ts`, `src/composition/challenge.ts`, `src/app/desafio.tsx`, `tests/unit/domain/challenge/fixed-challenge.test.ts`, `tests/integration/persistence/sqlite-challenge.test.ts`.

Copiados sem mudança de regra: `scoring.ts` e a seleção de desafio de `app-english`. A função de sorteio ganha o complemento com palavras não estudadas descrito em Decisões Principais. Não copiar `levels.ts` nem os casos de uso que listam níveis.

Reutilizados da fundação: `english.db`, migração 1, aluno local e o executor SQL. A rota atual de desafio indisponível é substituída.

Fora deste repositório: `app-english` inteiro, e o tabuleiro até que `prd-jogo-pareamento-nativo` tenha especificação.
