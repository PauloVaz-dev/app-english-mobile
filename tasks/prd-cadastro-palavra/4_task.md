# Tarefa 4.0: Tela de Palavras

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Substituir o aviso de atividade indisponível em `/palavras` pelo formulário de nova palavra: inglês, português e frase opcional, com Adicionar e Voltar. O estado do formulário fica num módulo puro e a tela usa a composição da tarefa 3.0.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- A rota `src/app/palavras.tsx` deixa de usar `UnavailableActivity`. A entrada continua com as mesmas quatro ações.
- Título diz que é para adicionar uma palavra nova. Campos nesta ordem: inglês, português, frase (opcional).
- Adicionar é a ação principal. Voltar retorna à entrada sem gravar.
- Erros aparecem em cada campo, os dois juntos quando for o caso, por texto e não só por cor. O foco vai para o primeiro campo com erro. O texto digitado permanece.
- Duplicata mostra o inglês e o português já gravados, ligada aos dois campos.
- Sucesso mostra a mensagem em texto e limpa os três campos. A mensagem some ao digitar a próxima palavra ou quando aparece um erro.
- Falha de gravação mantém o texto e oferece tentar de novo. O botão fica bloqueado durante a gravação.
- O teclado não cobre o campo em edição (`KeyboardAvoidingView` com `behavior="padding"`).
- Leitor de tela: título, nome de cada campo, "obrigatório" ou "opcional", erro do campo e anúncio de sucesso, duplicata e falha. Alvos de pelo menos 44 por 44 pontos.
- Sair da rota descarta só o que não foi gravado. Sem rascunho.
- A lógica da tela fica em módulo puro, fora de `src/app/`.
</requirements>

## Subtarefas

- [x] 4.1 Escrever os testes de unidade que falham para `word-form`: erros por campo, os dois juntos, foco no primeiro erro, duplicata, sucesso limpando os campos, mensagem que some ao digitar, falha preservando o texto, botão bloqueado, rótulos e anúncios.
- [x] 4.2 Escrever o teste de integração que falha: o controlador do formulário com a composição contra o SQLite de teste cadastra, recusa a duplicata e mantém o texto numa falha.
- [x] 4.3 Implementar `word-form.ts`.
- [x] 4.4 Implementar `word-form-screen.tsx` e ligar a rota `/palavras`.
- [x] 4.5 Refatorar até os testes passarem e conferir que o bundle Android compila.

## Detalhes de Implementação

Ver `techspec.md`: fluxo em Visão Geral dos Componentes, Pontos de Integração (teclado e acessibilidade) e Riscos Conhecidos. O padrão de tela está em `src/components/game/practice-screen.tsx` e `src/lib/presentation/game/practice-screen.ts`; o campo pode partir de `src/components/ui/input.tsx`.

## Critérios de Sucesso

- `/palavras` não mostra mais o texto de atividade indisponível.
- Dez palavras podem ser cadastradas em sequência sem sair do formulário.
- Uma falha de gravação não apaga o texto digitado.
- Nenhum sinal de erro, sucesso ou campo obrigatório depende só de cor.

## Testes da Tarefa

- [x] Testes de unidade: estado e textos do formulário.
- [x] Testes de integração: formulário e composição contra o SQLite de teste.
- [ ] Testes E2E: não se aplicam. A verificação no aparelho é manual, num development build.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/app/palavras.tsx`
- `src/lib/presentation/vocabulary/word-form.ts`
- `src/components/vocabulary/word-form-screen.tsx`
- `src/composition/installed-word-registration.ts`
- `src/components/ui/input.tsx`
- `tests/unit/presentation/vocabulary/word-form.test.ts`
- `tests/integration/composition/word-form.test.ts`
