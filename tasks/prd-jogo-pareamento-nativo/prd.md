# PRD — Jogo de pareamento no aplicativo

## Visão Geral

O pareamento é o treino de reconhecimento: a pessoa liga o português ao inglês, recebe feedback na hora e segue até concluir 20 palavras. No aplicativo, esse mesmo jogo serve a três entradas. Como treino principal, usa o histórico do aluno para sortear com mais peso o que está difícil. Como segunda etapa da revisão diária, aplica as notas mais fracas definidas naquele PRD. Como treino livre, registra a prática sem mexer na agenda.

A tela pode ser desenhada para o polegar. Meta, tabuleiro, reposição, seleção ponderada, progresso por palavra e o resultado com "Precisa revisar" e "Mandou bem" permanecem.

## Objetivos

- Concluir uma partida de 20 palavras sem conta, sem rede e sem configuração.
- Manter no máximo 5 pares visíveis, com reposição a cada acerto.
- Dar feedback imediato em todo acerto e todo erro, sem revelar a resposta no erro.
- Sortear as 20 palavras com peso maior para as difíceis daquele aluno, sem repetir palavra na sessão.
- Guardar exposição, acerto, erro e tempo até o acerto uma única vez por evento válido.
- Mostrar no resultado até três palavras para revisar e até três acertos rápidos e limpos.
- Fazer o treino livre registrar estatísticas sem alterar a agenda de revisão.

Uma partida concluída do início ao resultado, com os mesmos números depois de fechar e abrir o aplicativo, encerra esta entrega.

## Histórias de Usuário

- Como estudante, quero começar um treino com um toque para praticar sem preparar nada.
- Como estudante, quero associar português e inglês em cartões grandes para usar com o polegar.
- Como estudante, quero ouvir o inglês depois do acerto e continuar mesmo se o aparelho não tiver voz.
- Como estudante, quero ver com mais frequência as palavras que eu erro ou demoro.
- Como estudante, quero no final saber o que revisar e também o que eu acertei rápido.
- Como estudante no treino livre, quero praticar sem adiantar nem atrasar minha revisão de amanhã.
- Como pessoa que usa leitor de tela, quero saber qual cartão está selecionado e se a associação deu certo sem depender só da cor.

**Casos extremos:** catálogo ativo com menos de 20 palavras, abandono no meio, palavra exposta e não acertada, último par da tela durante a revisão, reabertura da partida já encerrada.

## Funcionalidades Principais

### 1. Partida

1. O aluno deve iniciar o treino sem login e sem escolher tamanho, deck ou dificuldade.
2. A meta é 20 palavras concluídas. O cronômetro começa com a partida e para ao concluir ou abandonar.
3. Cada partida fica gravada para o aluno local, com início, término, duração, meta, acertos e erros.
4. Se o catálogo ativo tiver menos de 20 palavras, o início falha com uma explicação, sem partida parcial.
5. Abandonar encerra a partida como não concluída.

### 2. Tabuleiro

6. A área mostra até 5 palavras em português e as 5 correspondentes em inglês, em posições independentes.
7. A mesma palavra não ocupa mais de um par ao mesmo tempo.
8. A pessoa seleciona um cartão de cada idioma. A seleção tem estado visível e anunciável.
9. A associação é correta somente quando os dois cartões são a mesma palavra.
10. No acerto, os dois cartões saem, o acerto é contado, a tentativa e o tempo são registrados, e a pronúncia do inglês toca uma vez.
11. Enquanto a meta não foi cumprida e houver palavras, um novo par ocupa a vaga.
12. No erro, a falha é indicada, o erro é contado, a tentativa é registrada, os cartões permanecem e a resposta não é revelada. A seleção é limpa.
13. Só a associação correta conta para a meta. Erro não muda a meta.
14. Falha de áudio não impede o acerto, o registro nem a reposição.
15. Durante a partida ficam visíveis cronômetro, acertos, erros e progresso até 20.
16. A vigésima associação correta encerra a partida.

### 3. Seleção ponderada

17. No treino principal, cada palavra ativa recebe peso pela classificação daquele aluno: fácil 1, normal 3, difícil 6.
18. Palavra sem progresso ou sem amostra mínima recebe o peso de normal.
19. Aluno sem histórico recebe sorteio uniforme entre as ativas.
20. Nenhuma palavra se repete na sessão. O peso é do aluno, nunca um consolidado global do catálogo.
21. A ponderação não muda meta, tabuleiro, acerto, erro, exposição nem o registro da tentativa.

### 4. Progresso da palavra

22. O progresso do aluno na palavra guarda exposições, acertos, erros, tempo total até os acertos e a data da última interação.
23. A exposição ocorre uma vez por palavra na partida, na primeira entrada no tabuleiro. Repetir a tela ou errar não cria outra exposição.
24. O tempo de cada tentativa vai da primeira seleção, com o tabuleiro livre, até a seleção que fecha o par, como na medição versão 2 do site. O tempo de observação do tabuleiro não entra. O total de acerto soma só as tentativas corretas. (Revisado em 2026-11-12: a versão anterior media desde a exposição.)
25. Palavra exposta e não acertada mantém exposição e erros, sem tempo de acerto inventado.
26. Reenviar a mesma tentativa não altera os consolidados outra vez.
27. Com histórico suficiente, a palavra é classificada como fácil, normal ou difícil pelas regras já existentes. Os limiares não mudam nesta entrega.
28. O resultado de uma partida concluída mostra duração, acertos, erros, precisão e tempo médio. A precisão usa todas as tentativas da sessão.

### 5. Leitura do resultado

29. "Precisa revisar" lista até três palavras da sessão, pelas regras já usadas no produto para destacar erro ou demora.
30. "Mandou bem" vem depois e lista no máximo três palavras da própria sessão com zero erros e tempo até o acerto de no máximo 2 segundos.
31. As candidatas de "Mandou bem" ordenam pelo menor tempo e, no empate, pelo inglês em ordem alfabética. Cada item mostra inglês, tradução, 100% e o tempo.
32. Sem candidatas, a interface diz que não houve destaque, sem lista vazia.
33. Fechar e abrir o aplicativo mostra o mesmo resultado da partida encerrada.
34. Do resultado, a pessoa inicia outra partida ou volta para a entrada.

### 6. Uso dentro da revisão e no treino livre

35. Quando o tabuleiro é a segunda etapa da revisão, as notas seguem o PRD de revisão: no máximo Bom, e no máximo Difícil se o par era o único restante.
36. No treino livre, as respostas entram no histórico e nas estatísticas, e não alteram estado, facilidade nem próxima revisão.
37. Distratoras incluídas só para completar o tabuleiro da revisão não alteram a própria agenda.

## Experiência do Usuário

Um toque começa a partida. O tabuleiro ocupa a tela: cartões grandes, duas línguas distinguíveis por texto, seleção óbvia. Cronômetro e placar ficam num cabeçalho que não empurra os cartões para fora da vista. Não há rolagem para jogar.

Acerto e erro são imediatos, curtos e diferentes entre si por ícone ou texto, além da cor. A pronúncia acompanha o acerto e não é necessária para entender o que aconteceu. Redução de movimento do aparelho reduz animação.

No resultado, primeiro o que revisar, depois o que foi bem, em listas curtas. Sem fórmulas, pesos ou "amostra mínima" na interface.

Acessibilidade: cada cartão tem nome, idioma e estado. O leitor de tela anuncia acerto e erro. Alvos de pelo menos 44 por 44 pontos. Foco e ordem coerentes para quem navega por acessibilidade.

## Restrições Técnicas de Alto Nível

- Roda no aplicativo local, offline, para o aluno único do aparelho.
- As regras de acerto, meta, peso e classificação permanecem as do produto atual.
- A pronúncia usa a voz do aparelho. Sem voz, o jogo segue.
- Nenhuma tentativa do desafio entra nestes consolidados. Essa separação está no PRD do desafio.
- Feedback de toque não pode atrasar de forma perceptível a reposição do par.
- As regras do jogo não ficam presas à tela: a revisão e o desafio reutilizam o mesmo pareamento.

## Fora de Escopo

- Escolher duração, quantidade de pares, deck ou dificuldade antes da partida.
- Alterar a meta de 20 ou os limiares de fácil, normal e difícil.
- FSRS e mudança do algoritmo da agenda.
- Cadastro e importação de palavras.
- Pontuação, combo, recorde e ranking. Isso pertence ao desafio.
- Dashboard, gráfico e histórico tentativa a tentativa.
- Conta, sincronização, backup e mais de um aluno.
- Reconhecimento de voz, avaliação de pronúncia e áudio vindo de serviço externo.
