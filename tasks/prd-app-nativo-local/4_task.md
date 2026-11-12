# Tarefa 4.0: Fuso do aparelho

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

O dia de estudo segue o fuso do aparelho. Esta task lê esse fuso, grava no aluno e devolve `America/Sao_Paulo` quando o aparelho não informa um fuso válido. O resumo ainda não é calculado aqui.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Ler `getCalendars()[0].timeZone`.
- Aceitar só fuso que `isValidTimeZone` aprove.
- Se o valor vier nulo ou for inválido, usar o fuso já gravado no aluno.
- Sem valor gravado, usar `DEFAULT_TIME_ZONE` (`America/Sao_Paulo`).
- Gravar quando o fuso válido do aparelho for diferente do armazenado.
- Reler quando o aplicativo volta ao primeiro plano.
- Implementar `VisitorPreferences` com `getTimeZone` e `saveTimeZone`.
</requirements>

## Subtarefas

- [x] 4.1 Escrever os testes de unidade que falham para fuso válido, nulo e inválido.
- [x] 4.2 Escrever o teste de integração que falha enquanto o fuso não é gravado e relido do SQLite.
- [x] 4.3 Implementar a leitura do aparelho e `SqliteVisitorPreferences`.
- [x] 4.4 Relacionar a releitura ao retorno do app para o primeiro plano, sem desenhar a entrada.
- [x] 4.5 Refatorar até os testes passarem usando `isValidTimeZone` e `DEFAULT_TIME_ZONE` já copiados.

## Detalhes de Implementação

Ver `techspec.md`: Interfaces Principais (fuso e relógio), Pontos de Integração e Riscos Conhecidos (fuso IANA no Hermes e mudança de fuso no Android).

Não criar outra regra de dia. `local-day.ts` permanece a fonte.

## Critérios de Sucesso

- Fuso IANA válido é o que fica gravado.
- `null` e texto que `isValidTimeZone` rejeita não apagam um fuso já gravado.
- Sem gravação anterior, o resultado é `America/Sao_Paulo`.
- Fechar e abrir o arquivo devolve o último fuso válido salvo.

## Testes da Tarefa

- [x] Testes de unidade: válido, nulo e inválido, com calendário e preferências falsos.
- [x] Testes de integração: `saveTimeZone` e `getTimeZone` no mesmo arquivo SQLite.
- [x] Testes E2E: não se aplicam. Não há asserção de tela.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/time/device-time-zone.ts`
- `src/persistence/sqlite-visitor-preferences.ts`
- `src/lib/domain/learning/local-day.ts`
- `src/lib/application/review/ports/visitor-preferences.ts`
