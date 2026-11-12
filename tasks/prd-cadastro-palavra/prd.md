# PRD — Cadastro de palavra

## Visão Geral

O aplicativo abre com o vocabulário inicial e a entrada já mostra o que estudar. A pessoa que encontra uma palavra numa aula, num livro ou numa conversa não consegue guardá-la: o destino Palavras só avisa que a atividade não está disponível. Esta entrega troca esse aviso por um formulário curto no próprio celular.

O cadastro vale para uma pessoa, num aparelho, sem conta e sem rede. A palavra fica no catálogo do aparelho e entra como nova para esse aluno. O texto que ela digitou permanece, com os acentos. Uma palavra igual a outra já gravada não é salva de novo.

## Objetivos

- A pessoa adiciona uma palavra em menos de um minuto, sem sair do formulário para cadastrar a seguinte.
- Inglês e português vazios, longos demais ou repetidos não geram uma palavra nova.
- A palavra gravada continua no aparelho depois de fechar e abrir o aplicativo, e pode entrar no estudo como palavra nova.
- O destino Palavras deixa de ser o aviso de atividade indisponível.

Sucesso desta entrega: dez palavras novas, incluindo uma frase e uma duplicata recusada, são cadastradas em sequência sem perder o texto digitado quando a gravação falha.

## Histórias de Usuário

- Como estudante, quero cadastrar inglês, português e uma frase opcional para estudar uma palavra que ainda não está no vocabulário inicial.
- Como estudante, quero ver que a palavra foi adicionada e encontrar o formulário vazio para cadastrar outra na hora.
- Como estudante, quero ser avisado quando o par já existe, com o inglês e o português gravados, para não criar uma cópia.
- Como estudante, quero corrigir o campo errado sem reescrever o que já estava certo.
- Como pessoa que usa leitor de tela, quero ouvir o nome de cada campo e o erro ligado a ele, sem depender de cor.

**Casos extremos:** inglês ou português só com espaço, frase vazia, texto no limite e um caractere acima do limite, duplicata que muda só maiúscula, acento ou espaço, falha ao gravar, fechar o aplicativo no meio da digitação e reabrir.

## Funcionalidades Principais

### 1. Formulário no destino Palavras

O destino Palavras da entrada deixa de anunciar atividade indisponível e abre o cadastro. A pessoa volta para a entrada por uma ação explícita. Não há segundo botão de cadastro na entrada.

1. A rota de Palavras mostra o formulário de nova palavra.
2. Os campos são inglês, português e frase de exemplo. A frase é opcional.
3. A ação principal grava a palavra. A ação de voltar retorna à entrada e não grava o que estava digitado.
4. O vocabulário inicial continua disponível. Cadastrar não apaga nem reescreve palavra já gravada.

### 2. Texto aceito

O aplicativo guarda o texto que a pessoa quis escrever. Espaços nas pontas e espaços repetidos no meio não fazem parte da palavra. Acento e maiúscula do texto gravado permanecem.

5. Inglês e português são obrigatórios. Campo vazio ou só com espaço não grava e aponta o erro no próprio campo.
6. Inglês e português aceitam no máximo 80 caracteres, depois de tirar espaços das pontas e juntar espaços repetidos. Acima disso, o erro fica no campo e nada é gravado.
7. A frase aceita no máximo 240 caracteres, com a mesma regra de espaços. Vazia ou só com espaço é gravada como frase ausente, não como erro.
8. Se inglês e português falharem juntos, os dois erros aparecem. O texto digitado permanece nos três campos.

### 3. Duplicata

A mesma palavra não entra duas vezes. A comparação ignora maiúscula, acento e espaço. O texto exibido no aviso é o que já está gravado, não o que a pessoa acabou de digitar.

9. Se o par inglês-português já existe por essa comparação, a gravação não cria outra linha e não altera a palavra existente.
10. O aviso nomeia o inglês e o português já gravados e fica ligado aos dois campos.
11. "maçã" e "maca", "New York" e "newyork", e diferença só de maiúscula são o mesmo par.
12. Inglês igual com português diferente, ou o contrário, é palavra nova.

### 4. Palavra gravada e próxima

A palavra entra ativa, sem histórico de estudo, como nova para o aluno. Ela pode ser escolhida como palavra nova nas atividades que usam o catálogo. O cadastro não muda agenda, precisão nem classificação de palavra que já foi estudada.

13. Depois de gravar, a pessoa vê a mensagem de sucesso e os três campos vazios, prontos para outra palavra, sem voltar à entrada.
14. Fechar e abrir o aplicativo mantém a palavra. Uma segunda abertura não duplica a palavra recém-cadastrada.
15. Se a gravação falhar por outro motivo, nada é parcialmente gravado, o texto permanece e a pessoa pode tentar de novo.
16. Sair da rota no meio da digitação descarta só o que não foi gravado.

## Experiência do Usuário

A pessoa toca Palavras na entrada, lê que vai adicionar uma palavra nova e encontra três campos, nesta ordem: inglês, português e frase. O botão de adicionar é a ação principal. Voltar fica disponível e não compete com ela.

O teclado não cobre o campo em edição. O foco segue para o primeiro campo com erro. A mensagem de sucesso é texto, não só cor, e some quando a pessoa começa a digitar a próxima palavra ou quando um erro novo aparece.

O leitor de tela anuncia o título da tela, o nome de cada campo, se a frase é opcional, o erro daquele campo e a mensagem de sucesso. Alvos principais têm pelo menos 44 por 44 pontos. Cor não é o único sinal de erro, sucesso ou campo obrigatório.

## Restrições Técnicas de Alto Nível

- Roda no aplicativo local, sem rede, sem conta e sem serviço externo. O texto digitado não sai do aparelho.
- O catálogo é do aparelho. A palavra nova fica disponível para o estudo desse único aluno.
- Duplicidade e os limites de 80 e 240 caracteres seguem as regras já usadas no produto. Esta entrega não cria outro critério de palavra igual.
- Nenhuma atividade de estudo muda de regra por causa do cadastro. A palavra nova só passa a poder ser escolhida.
- Qualquer pessoa com o aparelho desbloqueado pode cadastrar. Isso é aceitável para um aluno por aparelho.
- A gravação de uma palavra não pode deixar a tela sem resposta a ponto de a pessoa não saber se deve tentar de novo.

## Fora de Escopo

- Corrigir, desativar, reativar ou listar o catálogo. Consulta, filtro e importação continuam no PRD de vocabulário e não entram aqui.
- Exclusão definitiva da palavra.
- Colar uma lista, arquivo de outro aplicativo e exportação.
- Tradução automática, geração de frase e correção por IA.
- Mais de um aluno, decks, tags e catálogos separados.
- Conta, sincronização, backup e envio do texto para um servidor.
- Trazer o catálogo do site.
- Mudar a cota de palavras novas do dia, a agenda ou a classificação.
