# Tarefa 5.0: Cartão de digitação

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Criar o cartão da etapa de digitação: estado puro e componente. Ele mostra o português, recebe o inglês e devolve a submissão. Não conhece banco nem sessão. Ainda não entra na tela da revisão.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Português visível com o teclado aberto. O campo recebe o foco a cada cartão.
- Enviar pelo botão ou pela tecla do teclado (`submitBehavior="submit"`, `returnKeyType="send"`), sem fechar o teclado entre cartões.
- `autoCorrect`, `spellCheck` e sugestões desligados; `autoCapitalize="none"`.
- "Dica" revela a primeira letra e marca `usedHint`. "Não sei" envia sem texto. As duas ações ficam alcançáveis e não escondidas pelo teclado.
- O tempo vai do aparecimento do cartão até o envio.
- Depois da resposta, o retorno de certo, quase e erro é diferente por texto e ícone, não só por cor, com a grafia correta e a frase de exemplo, se existir. O leitor de tela anuncia o resultado e a grafia correta.
- Envio vazio não é enviado; "Não sei" é o caminho para não responder.
- Alvos de pelo menos 44 por 44 pontos.
</requirements>

## Subtarefas

- [x] 5.1 Escrever os testes de unidade que falham para `typing-card`: dica, "não sei", envio vazio, tempo, textos e anúncios de certo, quase e erro, frase de exemplo.
- [x] 5.2 Implementar `typing-card.ts`.
- [x] 5.3 Implementar `typing-card.tsx` com teclado e acessibilidade.
- [x] 5.4 Testar a fronteira: o componente não importa composição, repositório nem regra de nota.
- [x] 5.5 Refatorar até os testes passarem.

## Detalhes de Implementação

Ver `techspec.md`: Pontos de Integração (`TextInput` e teclado) e Riscos Conhecidos. Padrões: `src/components/vocabulary/word-form-screen.tsx` (teclado e foco) e `src/components/game/pair-board.tsx` (feedback e anúncios).

## Critérios de Sucesso

- O cartão funciona só com o teclado: digitar, enviar, próximo.
- Nenhum sinal de resultado depende só de cor.

## Testes da Tarefa

- [x] Testes de unidade: estado e textos do cartão.
- [x] Testes de integração: uma sequência de cartões pelo estado puro, com dica, "não sei" e reforço, devolve as submissões na ordem com os tempos certos.
- [x] Testes E2E: não se aplicam. A verificação no aparelho é manual, num development build.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/lib/presentation/review/typing-card.ts`
- `src/components/review/typing-card.tsx`
- `tests/unit/presentation/review/typing-card.test.ts`
