# PRD — Desafio de 60 segundos no aplicativo

## Visão Geral

O treino de pareamento tem meta de 20 palavras e serve para aprender sem pressa. O desafio é o modo curto ao lado dele: 60 segundos para acertar o maior número possível de pares, com pontos e sequência, competindo só com o próprio recorde.

No aplicativo, o desafio reutiliza o tabuleiro do pareamento e a seleção de palavras já existente. Não pede rede, conta nem configuração. A pressão não pode contaminar a classificação fácil, normal e difícil, nem a agenda de revisão. Sair antes do fim não vira recorde.

A tela pode ser nova, desde que a duração, a pontuação e a separação do histórico de estudo permaneçam.

## Objetivos

- Concluir um desafio em no máximo 60 segundos, sem login e sem rede.
- Produzir sempre a mesma pontuação para a mesma sequência de acertos e erros.
- Nenhum erro dá ponto. Todo erro zera a sequência.
- Guardar o recorde pessoal da maior pontuação concluída e mostrá-lo igual depois de fechar o aplicativo.
- Impedir que tentativas do desafio alterem a classificação ou a agenda das palavras.
- Manter o treino de 20 palavras como caminho principal de estudo.

## Histórias de Usuário

- Como estudante, quero um minuto de jogo para ver quantas palavras acerto sob pressão.
- Como estudante, quero ver tempo, pontos e sequência durante a rodada.
- Como estudante, quero um par novo logo depois do acerto para não perder o ritmo.
- Como estudante, quero comparar o resultado com o meu recorde, não com o de outra pessoa.
- Como estudante, quero que o desafio não atrapalhe o que eu tenho para revisar amanhã.
- Como estudante que prefere calma, quero o treino normal continuando fácil de achar.
- Como pessoa que usa leitor de tela, quero entender o tempo e o fim da rodada sem depender de cor, piscada ou som.

**Casos extremos:** tempo acaba no meio de uma seleção, vocabulário acaba antes dos 60 segundos, saída voluntária, empate com o recorde, aparelho sem voz, catálogo pequeno demais para montar o tabuleiro.

## Funcionalidades Principais

### 1. Entrada

1. A entrada do aplicativo deve oferecer "Desafio 60s" sem substituir a revisão nem o treino de 20 palavras.
2. O aluno inicia sem login e sem escolher duração, dificuldade ou regras.
3. Antes de começar, a tela comunica duração, objetivo e a regra básica de pontos.
4. O início cria uma sessão de desafio do aluno local.

### 2. Rodada

5. A duração é de 60 segundos e não há pausa.
6. O cronômetro começa quando os primeiros cartões podem ser tocados.
7. O tabuleiro mostra até cinco pares de português e inglês, com as mesmas regras de seleção, acerto, erro e reposição do pareamento.
8. Uma palavra não aparece mais de uma vez na mesma sessão.
9. A escolha das palavras usa a política de seleção vigente e não cria pesos próprios.
10. Ao chegar a zero, novas associações são bloqueadas, a sessão encerra e só valem tentativas aceitas dentro do tempo.
11. Se as palavras disponíveis acabarem antes, a sessão termina e explica que o vocabulário acabou.
12. Sair antes do fim encerra como abandonada e não atualiza o recorde.
13. Falha de áudio não para o cronômetro, a pontuação nem o encerramento.

### 3. Pontuação

14. Cada acerto vale 100 pontos-base.
15. A partir do segundo acerto seguido, o bônus é o mínimo entre (sequência atual menos 1) vezes 10 e 50. O primeiro acerto vale 100, o segundo 110, o terceiro 120, e do sexto em diante no máximo 150.
16. Erro vale zero ponto, entra na precisão e zera a sequência.
17. A pontuação nunca fica negativa.
18. A dificuldade da palavra não altera os pontos.
19. Tempo restante, pontuação e sequência ficam visíveis durante a rodada.
20. O feedback de ponto não atrasa a reposição do próximo par.

### 4. Resultado e recorde

21. A sessão concluída mostra palavras acertadas, pontuação, precisão e maior sequência.
22. A precisão considera as tentativas certas e erradas aceitas na rodada.
23. O resultado diz se a pontuação superou o recorde anterior do aluno.
24. O recorde é a maior pontuação de uma sessão concluída. Sessão abandonada não conta.
25. Empatar o recorde não é apresentado como recorde novo.
26. Resultado e recorde permanecem iguais depois de fechar e abrir o aplicativo.
27. Do resultado, a pessoa joga de novo ou volta para a entrada.
28. O fim do tempo deve ser perceptível antes da troca para o resultado.

### 5. Separação do estudo

29. Acertos, erros, duração, pontuação e sequência ficam registrados como dados da sessão de desafio.
30. Tentativas do desafio não atualizam precisão, tempo médio, classificação fácil, normal ou difícil, nem a agenda de revisão.
31. O desafio pode usar o histórico de estudo para escolher palavras, sem modificá-lo.
32. A lista de palavras do aluno não trata tentativas do desafio como novas revisões.

## Experiência do Usuário

O desafio é uma alternativa visível, não a ação principal da entrada. A pessoa entende em uma frase: um minuto, o máximo de pares, pontos pela sequência.

Durante a rodada, o cabeçalho mostra saída, tempo, pontos e sequência. Os cartões dominam a tela. Nos dez segundos finais, a urgência aparece por texto ou número, não só por cor, piscada ou som. O leitor de tela recebe o tempo em momentos úteis, sem anunciar cada segundo.

Acerto é breve. Erro é claro e não trava o próximo toque. Redução de movimento do aparelho vale aqui também. Alvos principais têm pelo menos 44 por 44 pontos.

Estados de catálogo insuficiente, saída voluntária, tempo esgotado e vocabulário esgotado têm mensagem própria.

## Restrições Técnicas de Alto Nível

- Roda no aplicativo local, sem rede, sem conta e sem dado pessoal novo.
- Reutiliza o pareamento, o catálogo ativo e a seleção de palavras. Não cria um segundo conjunto de regras de associação.
- O tempo encerrado é a fonte da pontuação: tentativa depois do zero não entra.
- A voz do aparelho é opcional. Sem voz, o desafio segue.
- Atualização de tempo, pontos e cartões não pode ter atraso perceptível em uso normal.
- Métricas do desafio e métricas do estudo permanecem separadas.

## Fora de Escopo

- Mudar as regras do treino de 20 palavras ou da revisão diária.
- Escolher duração, dificuldade, deck ou quantidade de pares.
- Pausa, tempo extra, itens especiais ou compra de segundos.
- Bônus por dificuldade, pela velocidade da resposta ou pela palavra.
- Ranking, liga, competição entre pessoas e compartilhamento.
- XP, moedas, vidas, conquistas e economia virtual.
- Usar tentativas do desafio na classificação ou na agenda.
- FSRS.
- Reconhecimento de voz, avaliação de pronúncia e áudio externo.
- Conta, sincronização e backup.
