# PRD — Vocabulário no aplicativo

## Visão Geral

O aplicativo local começa com o vocabulário inicial. Esta entrega deixa a pessoa dona desse vocabulário no próprio celular: consultar o que já praticou, filtrar por dificuldade, cadastrar uma palavra, corrigir, desativar e importar uma lista colada.

O catálogo pertence ao aparelho. O progresso e a agenda pertencem ao aluno. Editar o texto não apaga o histórico. Desativar tira a palavra das sessões sem apagar o que já foi estudado. Não há exclusão definitiva nem envio da lista para fora do telefone.

As telas podem ser reorganizadas para uma mão só. As regras de duplicidade, de prévia da importação e dos filtros permanecem as do produto atual.

## Objetivos

- Consultar só as palavras que aquele aluno já praticou, com precisão, tempo médio e classificação quando houver amostra.
- Filtrar todas, difíceis, normais e dominadas sem misturar palavra sem classificação nos grupos.
- Cadastrar ou corrigir uma palavra sem perder agenda nem histórico.
- Impedir duplicata do mesmo par inglês-português.
- Importar até 500 linhas numa operação, com prévia do que será aceito, repetido ou rejeitado, em menos de 2 minutos para 100 palavras.
- Garantir que palavra desativada não entre em revisão, treino, treino livre nem desafio.

## Histórias de Usuário

- Como estudante, quero ver minhas palavras com precisão e tempo para saber onde estou fraco.
- Como estudante, quero filtrar difíceis e dominadas para decidir o que olhar.
- Como estudante, quero adicionar uma palavra que encontrei numa aula, com uma frase se eu tiver.
- Como estudante, quero corrigir uma tradução sem zerar a revisão daquela palavra.
- Como estudante, quero desativar uma palavra que não quero mais estudar e poder reativá-la depois.
- Como estudante, quero colar uma lista e ver, antes de confirmar, o que entrou e o que foi recusado.
- Como pessoa que usa leitor de tela, quero entender filtro ativo, erro de formulário e motivo da linha rejeitada sem depender de cor.

**Casos extremos:** aluno sem prática, filtro sem itens, linha inválida, duplicata com diferença só de acento ou maiúscula, importação com mistura de linhas boas e ruins, palavra desativada que já tem agenda.

## Funcionalidades Principais

### 1. Lista do que já foi praticado

1. A área de palavras deve ser alcançável pela entrada e pelo resultado do treino.
2. A lista inclui somente palavras com pelo menos uma exposição daquele aluno.
3. Cada item mostra inglês, português, precisão, tempo médio até o acerto, quantidade de revisões e a classificação, quando houver histórico suficiente.
4. Palavra praticada sem amostra mínima aparece em "Todas" como sem histórico suficiente, sem receber fácil, normal ou difícil.
5. Os filtros são Todas, Difíceis, Normais e Dominadas.
6. Palavra sem classificação não aparece em Difíceis, Normais nem Dominadas.
7. Sem prática, ou com filtro vazio, a tela explica o próximo passo. Não mostra uma lista muda.
8. Tentativas do desafio não aumentam a contagem de revisões desta lista.
9. Sair e voltar com o mesmo filtro mostra o mesmo conjunto.

### 2. Cadastro e correção

10. A pessoa pode adicionar uma palavra com inglês, português e, opcionalmente, uma frase de exemplo.
11. Pode editar os textos sem perder histórico nem agenda daquela palavra.
12. Pode desativar e reativar. Desativada não entra em sessões. O histórico permanece. Não há exclusão definitiva.
13. O mesmo inglês e o mesmo português, ignorando maiúsculas, acentos e espaços, são duplicata. O aplicativo informa qual palavra já existe e não grava a nova.
14. Palavra recém-cadastrada começa como Nova para o aluno.
15. Erros de validação ficam ligados ao campo correspondente, em texto.

### 3. Importação

16. A pessoa importa colando texto, uma palavra por linha, no formato inglês, português e frase opcional.
17. Antes de confirmar, vê a prévia: quantas linhas são válidas, duplicadas e inválidas, e o motivo de cada rejeição.
18. Confirmar grava só as linhas válidas e não duplicadas, e informa o total importado.
19. Uma importação aceita até 500 linhas.
20. Linha rejeitada não impede as linhas válidas da mesma cola.
21. Palavras importadas começam como Novas.
22. A prévia não grava nada até a confirmação. Cancelar deixa o catálogo como estava.

### 4. Efeito nas sessões

23. Só palavra ativa pode entrar em revisão, treino de 20 palavras, treino livre e desafio.
24. Desativar no meio de uma sessão já iniciada não apaga as notas já registradas nessa sessão.
25. Reativar devolve a palavra com a agenda e o histórico que ela já tinha.

## Experiência do Usuário

A área de palavras separa duas intenções: consultar o que eu já pratiquei e alterar o catálogo. A consulta abre primeiro, com filtros em texto. A lista rola. O item deixa a palavra maior que os números.

Adicionar é um formulário curto. Importar é colar, ler a prévia e confirmar. A prévia agrupa válidas, duplicadas e inválidas, com o motivo ao lado da linha. Cem palavras devem ser conferidas e confirmadas em menos de dois minutos.

O teclado não cobre o campo em edição. O leitor de tela anuncia o filtro ativo, o erro do campo e o motivo da rejeição. Cor não é o único estado do filtro nem da linha inválida. Alvos principais têm pelo menos 44 por 44 pontos.

Estados vazios dizem o que fazer: jogar uma partida, escolher outro filtro ou corrigir a lista colada.

## Restrições Técnicas de Alto Nível

- Roda no aplicativo local, sem rede e sem serviço externo. Colar a lista não envia o texto para fora do aparelho.
- O catálogo é do aparelho. Progresso e agenda são do aluno e sobrevivem à edição do texto.
- Duplicidade, limite de 500 linhas e filtros usam as regras já definidas no produto.
- Nenhum dado pessoal é pedido.
- Qualquer pessoa com o aparelho desbloqueado pode editar o catálogo. Isso é aceitável para uso pessoal de um aluno por aparelho.
- A importação de 500 linhas não pode travar a tela a ponto de a pessoa não saber se a prévia ainda está sendo preparada.

## Fora de Escopo

- Exclusão definitiva e exportação do vocabulário.
- Arquivo compartilhado de outro aplicativo, quando a cola de texto resolver a importação.
- Decks, tags, catálogos separados por aluno e mais de um aluno.
- Conta, sincronização, backup e envio da lista para um servidor.
- Trazer o catálogo ou o progresso do site.
- Mudar pesos, limiares de dificuldade, agenda ou regras de sessão.
- Tradução automática, geração de frase e correção por IA.
- Dashboard, gráficos e o detalhe de cada tentativa.
