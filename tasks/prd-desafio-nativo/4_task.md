# Tarefa 4.0: Pronúncia que não trava a rodada

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

No acerto, o aplicativo pronuncia o inglês com a voz do aparelho. Se a voz falhar ou não existir, a tentativa continua gravada, o cronômetro segue e o próximo par não espera o áudio. Nenhuma tela nova entra nesta task.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Instalar `expo-speech` com `npx expo install`.
- Falar o inglês do par acertado, com idioma `en-US`.
- Não esperar o fim da fala antes de repor o par.
- `onError` não propaga para a sessão nem para o repositório.
- Não chamar `getAvailableVoicesAsync`.
- Falha registra `challenge.speech_failed` só no aparelho.
- Depende da tarefa 3.0 para o ponto em que o acerto já foi aceito.
</requirements>

## Subtarefas

- [x] 4.1 Escrever o teste de unidade que falha quando um erro da voz ainda chega em quem chamou a pronúncia.
- [x] 4.2 Escrever o teste de integração que falha enquanto um acerto com voz quebrada não permanece gravado na sessão.
- [x] 4.3 Implementar `device-speech` e ligá-lo só depois da tentativa aceita.
- [x] 4.4 Garantir que erro e acerto sem voz também seguem a rodada.
- [x] 4.5 Refatorar até os testes passarem sem a sessão importar `expo-speech`.

## Detalhes de Implementação

Ver `techspec.md`: Pontos de Integração (`expo-speech`) e Riscos Conhecidos (falha silenciosa no Android).

A sessão de domínio não importa fala. Quem chama a voz é a composição ou o adaptador ao lado dela, depois do `attempt` bem-sucedido.

## Critérios de Sucesso

- Acerto com voz que falha continua na sessão, com a mesma pontuação.
- Erro de associação não dispara fala.
- A rodada de teste termina sem esperar callback de áudio.
- `src/lib/domain/challenge` não importa `expo-speech`.

## Testes da Tarefa

- [x] Testes de unidade: adaptador de voz com `speak` que chama `onError` não lança.
- [x] Testes de integração: composição com voz falsa registra o acerto mesmo quando a fala falha.
- [ ] Testes E2E: não se aplicam. Não há asserção de alto-falante.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/speech/device-speech.ts`
- `src/composition/challenge.ts`
- `package.json`
