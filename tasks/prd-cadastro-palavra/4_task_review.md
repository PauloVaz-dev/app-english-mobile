# Revisão da Tarefa 4.0: Tela de Palavras

## Resultado

Aprovada. Nenhum problema crítico ou maior.

## Verificações

| Verificação | Resultado |
| --- | --- |
| `npx vitest run` (suíte inteira) | 55 arquivos, 453 testes, todos passam |
| Testes desta tarefa | 2 arquivos, 23 testes (20 de unidade, 3 de integração), todos passam |
| `npx tsc --noEmit` | sem erros |
| `npx expo lint` | 1 erro, o que já existia em `src/hooks/use-color-scheme.web.ts`; nenhum novo |
| `npx expo export --platform android` | bundle Hermes gerado (4,4 MB); `dist/` apagado depois, porque não existia |
| TDD | os dois arquivos de teste falharam por falta de `@/lib/presentation/vocabulary/word-form` antes da implementação; os 3 testes de fronteira falharam até a tela e a rota existirem |
| Expo/RN v58 | guia de teclado da Expo: `behavior` nas duas plataformas porque o Android é edge-to-edge; `app.json` não usa `softwareKeyboardLayoutMode="pan"`. `KeyboardAvoidingView`, `AccessibilityInfo.announceForAccessibility`, `submitBehavior` e `TextInputInstance` conferidos nos tipos do RN 0.88 |
| Regras copiadas, caso de uso, repositório e composição | sem alteração |
| `app-english` | não foi lido nem alterado nesta tarefa |

## Requirements x testes

| Requirement | Coberto em |
| --- | --- |
| Rota sem `UnavailableActivity`; entrada com as mesmas quatro ações | "no longer shows the unavailable activity and keeps the route thin"; "keeps the entry with the same four actions" |
| Título de palavra nova; campos inglês, português, frase (opcional) | "says it adds a new word and lists English, Portuguese and the optional sentence in order" |
| Adicionar principal; Voltar sem gravar | "makes Adicionar the main action and Voltar a return without saving" (Voltar é um `Link` para `/`, sem chamada ao controlador) |
| Erros por campo, os dois juntos, por texto, foco no primeiro, texto mantido | "shows both required errors, keeps the text, focuses English and never calls the database"; "focuses the first invalid field when only a later one fails"; "names the limits of English and of the sentence"; "treats an invalid outcome from the composition like the local check" |
| Duplicata com o texto gravado, ligada aos dois campos | unidade "names the stored duplicate on both fields..."; integração "registers a word, refuses the duplicate with the stored text..." |
| Sucesso em texto, limpa os três campos; some ao digitar ou com erro | "clears the three fields after success..."; "hides the success message when the next word is typed"; "hides the success message when an error appears" |
| Falha mantém o texto e oferece tentar de novo; botão bloqueado | unidade "keeps the text on a failed save, offers to try again and lets it succeed"; "blocks the button while saving and ignores a second tap"; integração "keeps the typed text when the save fails and saves it on the retry" (registra `words.create_failed`, nenhuma linha) |
| Teclado não cobre o campo | "lifts the field over the keyboard and announces with a static import" (`behavior="padding"`, `keyboardShouldPersistTaps="handled"`) |
| Leitor de tela e alvos de 44 pt | rótulos "Inglês, obrigatório" etc. e erro no `accessibilityHint`; anúncios de sucesso, duplicata e falha, com o foco antes do anúncio; "keeps touch targets at 44 points like the entry" |
| Sem rascunho | "holds no draft between visits"; o estado vive só no controlador da visita |
| Lógica fora de `src/app/`, sem RN/Expo | "keeps the form logic free of React Native and Expo" |
| Meta do PRD (dez palavras, uma frase, uma duplicata, nove linhas) | integração "registers ten words in sequence..."; unidade "registers ten words in a row without leaving the form" |

## Achados

### Menores

1. O campo não parte de `src/components/ui/input.tsx`: ele usa NativeWind (`className`) e altura `h-10` (40 pt), abaixo dos 44 pt, enquanto a tela segue o padrão de `practice-screen.tsx` com `StyleSheet` e a paleta da entrada. O `TextInput` do React Native foi usado direto, com `minHeight` de 44 pt.
2. O rótulo visível e o erro visível ficam ocultos do leitor de tela (`importantForAccessibility="no"` / `accessibilityElementsHidden`) para não serem lidos duas vezes; o leitor recebe o mesmo conteúdo pelo `accessibilityLabel` e pelo `accessibilityHint` do campo.
3. Os campos continuam editáveis durante a gravação, porque um `TextInput` não editável não recebe o foco que o sucesso devolve ao inglês. Se a pessoa digitar enquanto salva e a gravação der certo, o que ela digitou nesse intervalo é limpo junto com os campos. A gravação é curta e o botão fica bloqueado.
4. Sair da rota durante a gravação não cancela a gravação já iniciada (ela é concluída, como o PRD permite) e o anúncio do resultado ainda pode ser falado.
5. A duplicata é exibida como erro nos dois campos ("Já cadastrada: inglês — português.") e o foco vai para o inglês; o anúncio diz "Esta palavra já está cadastrada: …".
6. Em falha, o botão principal passa a "Tentar de novo"; a mensagem fica até a próxima tentativa.
7. Erros de campo só são recalculados no próximo Adicionar; digitar não apaga o erro do campo (o PRD só pede que a mensagem de sucesso suma ao digitar).

### Verificação manual pendente

- No aparelho (development build), com TalkBack/VoiceOver: ordem foco → anúncio, teclado sobre o campo de frase, e Voltar.

### Positivos

- Validação local com `parseVocabularyTexts` antes da composição; o resultado `invalid` da composição usa o mesmo caminho.
- Nenhuma `message` em inglês dos erros do domínio chega à tela.
- O controlador é testado sem React Native, com `focus` e `announce` injetados pela tela.
