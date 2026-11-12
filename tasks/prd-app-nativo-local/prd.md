# PRD — Aplicativo nativo local

## Visão Geral

O estudo de vocabulário hoje acontece num site que precisa de um servidor para abrir, mesmo com um único aluno e um banco que já vive na máquina. Esta entrega troca esse site por um aplicativo de celular que abre, estuda e guarda o progresso sem conta, sem rede e sem serviço externo.

O aplicativo atende uma pessoa, num aparelho. Ele cria a identidade local na primeira abertura, traz o vocabulário inicial do produto e mostra na entrada o que há para estudar hoje. As atividades em si — revisão por digitação, pareamento, desafio e gestão do vocabulário — ficam nos PRDs seguintes. Esta parte garante que o aluno encontre o aplicativo, reconheça o próprio progresso depois de fechar e volte para o mesmo ponto.

## Objetivos

- Abrir o aplicativo e ver o resumo do dia sem conexão e sem criar conta.
- Manter o mesmo aluno e os mesmos dados depois de fechar e abrir de novo.
- Mostrar, na entrada, quantas palavras estão vencidas hoje, quantas novas ainda podem entrar hoje e, quando não houver pendência, a data da próxima revisão.
- Oferecer caminhos claros para revisar, treinar livremente, jogar o desafio e consultar palavras.
- Incluir o vocabulário inicial do produto, para o primeiro dia já ter o que estudar.
- Tratar perda do aparelho como perda dos dados: não há cópia fora do telefone nesta entrega.

O sucesso desta parte é um aluno concluir o ciclo "abrir, ler o resumo, sair, abrir de novo e ver o mesmo resumo" sem rede.

## Histórias de Usuário

**Persona principal:** estudante adulto brasileiro, do básico ao intermediário, que estuda de 5 a 15 minutos por dia no celular, sem querer criar conta.

- Como estudante, quero abrir o aplicativo no ônibus, sem internet, para começar o estudo do dia.
- Como estudante, quero ver logo quantas palavras me esperam hoje para decidir se tenho tempo.
- Como estudante, quero fechar o aplicativo no meio do dia e encontrar o mesmo progresso quando voltar.
- Como estudante no primeiro uso, quero já ter palavras disponíveis para não ficar numa tela vazia.
- Como estudante, quero achar revisão, treino livre, desafio e palavras sem procurar num menu escondido.
- Como pessoa que usa leitor de tela, quero entender o resumo do dia e os destinos sem depender só de cor ou posição.

**Casos extremos:** primeira abertura, dia sem pendências, aparelho sem voz, relógio do aparelho mudando o dia local, reabertura depois de encerrar o aplicativo.

## Funcionalidades Principais

### 1. Um aluno por aparelho

O aplicativo reconhece uma única pessoa e não pede cadastro.

1. Na primeira abertura, o aplicativo deve criar um aluno local e reutilizá-lo em todas as aberturas seguintes.
2. O aluno não deve informar nome, e-mail nem senha para estudar.
3. Fechar o aplicativo, bloquear o telefone ou reiniciar o aparelho não deve trocar o aluno nem apagar o progresso.
4. Não deve existir troca de aluno dentro do aplicativo.

### 2. Estudo sem rede

O valor do produto é estudar no celular sem depender de servidor.

5. Abrir, ler o resumo, iniciar um caminho de estudo e gravar o resultado devem funcionar com o aparelho offline.
6. Nenhuma etapa do estudo deve exigir conta, login ou serviço externo.
7. A pronúncia, quando existir nas atividades seguintes, deve usar a voz do próprio aparelho. A falta de voz não pode impedir o uso do aplicativo.

### 3. Entrada com o resumo do dia

A primeira tela responde "o que eu estudo agora".

8. A entrada deve mostrar quantas palavras estão vencidas hoje e quantas palavras novas ainda podem ser introduzidas hoje.
9. Esses números devem seguir o dia local do aparelho, não um fuso fixo.
10. Sem palavras vencidas e sem novas disponíveis, a entrada deve dizer que não há nada para revisar hoje e mostrar a data da próxima revisão.
11. A ação principal deve ser começar a revisão de hoje. As regras da sessão estão no PRD de revisão diária.
12. A entrada deve oferecer treino livre, desafio e palavras como destinos secundários, sem competir com a revisão.
13. Reabrir o aplicativo no mesmo dia deve mostrar o mesmo resumo, já refletindo o que foi estudado nessa abertura.

### 4. Vocabulário inicial

O primeiro dia precisa ser jogável antes de a pessoa cadastrar qualquer palavra.

14. A primeira abertura deve disponibilizar o vocabulário inicial já existente no produto.
15. Essas palavras devem começar como novas para o aluno local, com o progresso vazio.
16. O vocabulário e o progresso devem permanecer no aparelho entre aberturas.

### 5. Continuidade

O aluno precisa confiar que o que fez ficou gravado.

17. Progresso, sessões e vocabulário gravados devem continuar disponíveis depois de encerrar o aplicativo.
18. Repetir a abertura não deve duplicar o aluno nem o vocabulário inicial.
19. A entrada deve ficar legível em menos de um segundo em uso normal, com o vocabulário inicial e também com um catálogo de 5.000 palavras.

## Experiência do Usuário

A pessoa abre o aplicativo e cai direto no resumo do dia. Não há tela de login, tutorial obrigatório nem escolha de servidor. O resumo cabe na primeira dobra: quantidade vencida, novas restantes e um botão principal. Destinos secundários ficam visíveis, com rótulo de texto.

No primeiro uso, o resumo já reflete o vocabulário inicial. No dia sem pendência, a mensagem explica o próximo passo e oferece treino livre. Telas e navegação podem ser desenhadas para o polegar. O site não serve de layout obrigatório.

Acessibilidade: contraste suficiente, alvos de toque de pelo menos 44 por 44 pontos nos controles principais, nomes para leitor de tela e resumo anunciado como texto. Cor não é o único canal de estado. Animações respeitam a redução de movimento do aparelho.

## Restrições Técnicas de Alto Nível

- O produto é um aplicativo de celular e substitui o site. O estudo não depende de servidor nem de conexão.
- Os dados ficam no aparelho. Não há transmissão de vocabulário, progresso ou identidade para fora.
- Existe um aluno por instalação. O catálogo de palavras pertence ao aparelho. O progresso pertence a esse aluno.
- O dia de estudo é o dia local configurado no aparelho.
- As regras de agenda, jogo, desafio e cadastro não mudam. Esta entrega só as torna disponíveis sem rede.
- Nenhum dado pessoal é coletado.
- A separação entre regras de estudo e a forma de guardar os dados deve permanecer, para as partes seguintes reutilizarem as mesmas regras do produto atual.

## Fora de Escopo

- A sessão de revisão, o tabuleiro de pareamento, o desafio de 60 segundos e o cadastro ou a importação de palavras.
- Conta, login, recuperação de senha e mais de um aluno no mesmo aparelho.
- Sincronização, backup, exportação e recuperação depois de desinstalar ou trocar de telefone.
- Trazer o progresso já acumulado no site.
- Site, painel administrativo e qualquer API externa.
- FSRS, metas, sequência de dias, XP, ranking e notificação para lembrar o estudo.
