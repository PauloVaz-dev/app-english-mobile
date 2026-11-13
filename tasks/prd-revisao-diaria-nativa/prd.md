# PRD — Revisão diária no aplicativo

## Visão Geral

O aplicativo local já abre no resumo do dia. Esta entrega faz esse resumo virar uma sessão curta: só entra o que venceu e um limite de palavras novas, e a lembrança ativa acontece digitando o inglês a partir do português.

As regras continuam as do produto atual. Cada palavra tem agenda SM-2 por aluno. A sessão tem no máximo 20 palavras, no máximo 10 novas por dia, e duas etapas: digitar o que já está em revisão e associar o que ainda está novo ou em aprendizado. O pareamento da segunda etapa usa o tabuleiro descrito no PRD do jogo. O treino livre continua disponível quando não há pendência e não mexe na agenda.

A tela pode ser reorganizada para o celular. A nota, o intervalo e o que entra na sessão não podem mudar.

## Objetivos

- Nenhuma palavra com revisão futura entra em "Revisar hoje".
- No máximo 10 palavras novas por aluno por dia.
- Uma palavra acertada em três revisões consecutivas fica pelo menos 7 dias sem aparecer.
- Toda palavra em estado de revisão é praticada por digitação, não por reconhecimento.
- Começar a sessão leva menos de meio segundo com 5.000 palavras.
- Métricas visíveis no resultado: acertos, erros, palavras que ainda vencem hoje e a data da próxima revisão.

## Histórias de Usuário

**Persona principal:** o mesmo estudante do aplicativo local, estudando alguns minutos por dia no celular, sem conta.

- Como estudante, quero revisar só o que venceu hoje para não repetir o que ainda está fresco.
- Como estudante, quero que um erro traga a palavra de volta logo e que um acerto fácil a afaste.
- Como estudante, quero digitar o inglês a partir do português para saber se eu lembro, e não só se eu reconheço.
- Como estudante, quero que um erro de uma letra não conte como esquecimento total, e quero poder pedir uma dica ou dizer que não sei.
- Como estudante, quero o teclado do celular sem ele cobrir a palavra nem o campo.
- Como estudante, quando não houver nada para revisar, quero treinar sem alterar minha agenda.
- Como estudante que fecha o aplicativo no meio da sessão, quero que as notas já dadas permaneçam.

**Casos extremos:** primeiro dia só com palavras novas, mais de 20 palavras vencidas, etapa de digitação vazia, etapa de associação com menos de 3 palavras, resposta repetida, aparelho sem voz.

## Funcionalidades Principais

### 1. Agenda por palavra

1. Cada palavra do aluno deve ter um estado: Nova, Aprendendo ou Revisão.
2. Cada resposta deve gerar uma nota: Errei, Difícil, Bom ou Fácil.
3. A nota da palavra na sessão deve usar a primeira tentativa. Se a primeira foi erro, a nota é Errei, mesmo que um reforço posterior acerte.
4. Tempo de resposta correta: acima de 5 segundos é Difícil, de 2 a 5 segundos é Bom, abaixo de 2 segundos é Fácil.
5. Errei reinicia o intervalo, marca a palavra para o dia seguinte e reduz a facilidade.
6. Acertos aumentam o intervalo: o primeiro para 1 dia, o segundo consecutivo para 6 dias e os seguintes multiplicam o intervalo anterior pela facilidade. Difícil aumenta menos e reduz a facilidade. Fácil aumenta mais e eleva a facilidade.
7. A facilidade deve ter um mínimo, para a palavra não ficar presa em intervalos mínimos.
8. A palavra passa de Aprendendo para Revisão após dois acertos consecutivos em dias diferentes, e volta para Aprendendo ao receber Errei em Revisão.
9. No pareamento, a nota máxima é Bom, porque reconhecimento é evidência mais fraca do que lembrança.
10. No pareamento, o par acertado quando era o único que restava na tela recebe no máximo Difícil.
11. O aplicativo deve guardar, por palavra, repetições, esquecimentos, última revisão e próxima revisão.
12. O dia da agenda é o dia local do aparelho.
13. Registrar a mesma resposta mais de uma vez não pode alterar a agenda nem os contadores além da primeira vez.

### 2. Sessão "Revisar hoje"

14. Uma palavra está vencida quando a próxima revisão cai no dia atual ou antes, no fuso do aparelho.
15. A sessão tem no máximo 20 palavras.
16. As vencidas entram primeiro, da mais atrasada para a menos atrasada.
17. As vagas restantes são preenchidas com palavras Novas, no máximo 10 novas por aluno por dia.
18. Se houver mais de 20 vencidas, a sessão traz as 20 mais atrasadas, e outra sessão pode continuar o restante.
19. Palavra com revisão futura não entra em "Revisar hoje".
20. Ao terminar, o resultado informa quantas palavras ainda estão vencidas hoje.
21. Abandonar a sessão preserva as notas já registradas.

### 3. Duas etapas

22. A ordem é digitar as palavras em Revisão e, depois, associar as Novas e as que estão Aprendendo.
23. Uma etapa sem palavras é pulada.
24. Se a etapa de associação tiver menos de 3 palavras agendadas, o tabuleiro é completado com palavras já estudadas, só como distratoras, sem alterar a agenda delas.
25. A tela mostra a etapa atual e o progresso da sessão.
26. O comportamento do tabuleiro, do acerto, do erro e da pronúncia no pareamento está no PRD do jogo. As notas desta sessão seguem os itens 9 e 10.

### 4. Digitar em inglês

27. Cada cartão mostra o português e um campo para o inglês.
28. A comparação ignora maiúsculas, acentos, espaços nas pontas e espaços repetidos.
29. Uma única letra trocada, faltando ou sobrando é "quase": nota Difícil e a grafia correta visível.
30. Qualquer outra diferença é erro, nota Errei, com a resposta correta visível.
31. "Não sei" revela a resposta e registra Errei.
32. "Dica" revela a primeira letra. Um acerto depois da dica recebe no máximo Difícil.
33. Depois da resposta, o aplicativo pronuncia o inglês e mostra a frase de exemplo, se existir. Falha de áudio não bloqueia a atividade.
34. Palavra com Errei volta uma vez ao fim da etapa de digitação, sem mudar a nota já registrada.
35. O tempo vai do aparecimento do cartão até o envio da resposta.

### 5. Treino livre

36. Sem vencidas e sem novas disponíveis, a entrada oferece treino livre: o pareamento de 20 palavras sorteadas entre todas as ativas, com peso maior para as difíceis. (Revisado em 2026-11-12, seguindo a decisão do jogo de pareamento; a versão anterior usava só palavras já estudadas.)
37. O treino livre registra as respostas no histórico e nas estatísticas, e não altera estado, facilidade nem data da próxima revisão.

## Experiência do Usuário

Da entrada, "Revisar hoje" abre a sessão direto. Na digitação, a palavra em português fica visível com o teclado aberto. O campo recebe o foco em cada cartão. Enviar pode ser pelo botão ou pela ação de confirmar do teclado. "Dica" e "Não sei" ficam alcançáveis com o polegar e não escondidos pelo teclado.

O feedback de quase é diferente de acerto e de erro, com a grafia correta em texto. O leitor de tela anuncia o resultado e a resposta certa. Cor não é o único sinal. Alvos principais têm pelo menos 44 por 44 pontos.

No resultado, a leitura é curta: como foi a sessão, o que ainda vence hoje e quando é a próxima revisão. Dali a pessoa volta para a entrada ou continua, se ainda houver vencidas.

## Restrições Técnicas de Alto Nível

- Depende do aplicativo local: um aluno, dados no aparelho, dia local, sem rede.
- A agenda é do aluno. O catálogo é do aparelho.
- As regras de nota e de intervalo permanecem as atuais. Esta entrega não troca o algoritmo.
- A segunda etapa reutiliza o pareamento. Não cria um segundo jogo.
- Começar a sessão deve levar menos de 500 ms com 5.000 palavras.
- A nota é sempre derivada do desempenho. A pessoa não escolhe Errei, Difícil, Bom ou Fácil.
- O histórico de respostas deve poder sustentar outro algoritmo no futuro sem ser apagado.

## Fora de Escopo

- FSRS e qualquer algoritmo além do SM-2 atual.
- Múltipla escolha, ouvir e escolher, completar frase, digitar do inglês para o português e resposta falada.
- Autoavaliação manual da nota.
- A pessoa configurar o limite de novas ou o tamanho da sessão.
- Conta, sincronização, backup e mais de um aluno.
- Sequência de dias, metas, XP e conquistas.
- Cadastro, edição, importação e desativação de palavras, cobertos pelo PRD de vocabulário.
- O desafio cronometrado, que continua fora da agenda.
- Trazer a agenda já existente no site.
