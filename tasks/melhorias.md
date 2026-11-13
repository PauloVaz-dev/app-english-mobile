# Melhorias do aplicativo

Levantamento feito em 2026-11-12, a partir do código e de um teste na versão web. Ainda não houve uma partida completa no aparelho; os pontos de uso vêm da leitura do código.

## Estado atual

Funciona hoje:

- **Treino livre** (`/treino-livre`): 20 palavras sorteadas com peso maior para as difíceis, tabuleiro de 5 pares com reposição, voz no acerto, resultado com "Precisa revisar" e "Mandou bem".
- **Desafio de 60 segundos** (`/desafio`): pontuação por sequência, recorde, prazo que continua correndo em segundo plano. Não mexe no progresso de estudo.
- **Cadastro de palavra** (`/palavras`): inglês, português e frase opcional, com duplicata que ignora maiúscula, acento e espaço.
- **Base**: tentativas idempotentes, fila única de gravação, regras copiadas do site com os testes do site, 453 testes, lint e tipos limpos.

## Já resolvido

- [x] Versionar o projeto no git (commit inicial `b49bb59`).
- [x] Alinhar o `.prettierrc` ao estilo do código e zerar o lint (`9058a20`).
- [x] Avisos de depreciação no Metro causados por `import()` dinâmico de `react-native`.
- [x] Aviso vermelho de voz cobrindo o tabuleiro na web (agora é um aviso único).
- [x] Tempo de resposta medido como no site (da primeira à segunda seleção).

## 1. Crítico

- [ ] **Revisão diária.** "Revisar hoje" é o botão principal da entrada e ainda abre o aviso de indisponível. Sem ela, nenhuma palavra ganha agenda. Techspec e 6 tarefas prontas em `tasks/prd-revisao-diaria-nativa/`.
- [ ] **Teste manual no aparelho.** Partida completa de treino, desafio até o zero, sair no meio, "Tentar de novo", cadastro com o teclado aberto e leitor de tela (TalkBack).

## 2. Conteúdo

- [ ] **Poucas palavras.** São 32 ativas, e o treino usa 20 por partida: as partidas se repetem muito.
- [ ] **Vocabulário esgotado no desafio.** O desafio sorteia até 40 palavras, mas só há 32. Com menos de 1,9 s por acerto, a pessoa esgota tudo antes do zero e fica esperando o relógio. Opções: encerrar a rodada nesse momento (muda a regra do domínio, que só conclui no prazo) ou repetir palavras no desafio.
- [ ] **Importar lista colada.** Já previsto em `prd-vocabulario-nativo`. Resolve o volume mais rápido que o cadastro de uma em uma.
- [ ] **Reativar palavra.** Hoje uma palavra inativa conta como duplicata no cadastro e não há como reativá-la. Também previsto em `prd-vocabulario-nativo`.

## 3. Experiência de jogo

- [ ] **Ouvir sob demanda.** A voz só toca no acerto. Um botão de ouvir no cartão em inglês ajuda a aprender a pronúncia antes de responder.
- [ ] **Frase de exemplo no resultado.** A frase é gravada e nunca aparece. Mostrá-la em "Precisa revisar" dá contexto sem atrapalhar a partida.
- [ ] **"Treinar só estas".** Um botão no resultado para jogar as palavras de "Precisa revisar".
- [ ] **Vibração no erro.** O feedback some em 1,2 s e é só visual e sonoro. Uma vibração curta (`expo-haptics`, exige novo development build) ajuda com o som desligado.
- [ ] **Introdução repetida.** Depois da primeira partida, "Jogar de novo" poderia ir direto ao tabuleiro.
- [ ] **Última partida ao reabrir.** O resultado fica gravado, mas `/treino-livre` volta sempre para a introdução.
- [ ] **Recorde antes do desafio.** O recorde só aparece no resultado. Mostrá-lo na introdução dá um alvo para a rodada.

## 4. Visual

- [ ] **Modo escuro.** A paleta da entrada e do jogo é fixa e clara (`#F4F0E6`, em `src/lib/presentation/home/home-entry-layout.ts`). Com o celular em tema escuro, o app continua claro.
- [ ] **Cartões altos demais.** Os cartões usam `flex: 1` e, em telas altas, ficam grandes com o texto perdido no meio. Limitar a altura.
- [ ] **Identidade do tabuleiro.** Cartões brancos iguais nas duas colunas. Uma cor por idioma ajuda a se orientar mais rápido.

## 5. Código

- [ ] **Campo do React Native Reusables com 40 pt.** `src/components/ui/input.tsx` tem `h-10`, abaixo dos 44 pt exigidos; as telas usam `TextInput` direto. Ajustar o componente para poder reutilizá-lo.
- [ ] **Regra morta copiada do site.** Em `src/lib/domain/learning/attempt-progress.ts`, o segundo `if` de `assertAttemptProgressAllowed` nunca é alcançado. Corrigir na origem (`app-english`) e copiar de novo.
- [ ] **Aviso de `ImageBackground`.** Vem do NativeWind 4.2.7 (`react-native-css-interop`), não do app. Some quando o NativeWind sair da versão 4; não vale atualizar agora.

## Ordem sugerida

1. Executar as tarefas da revisão diária.
2. Teste manual no aparelho e ajustes que ele revelar.
3. Rodada de jogo: ouvir sob demanda, frase no resultado, "treinar só estas" e recorde na introdução do desafio.
4. Importar lista e reativar palavra, pelo PRD de vocabulário.
5. Modo escuro e ajuste dos cartões.
