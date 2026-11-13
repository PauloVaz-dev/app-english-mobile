# app-english-mobile

Aplicativo local de vocabulário em inglês (treino, desafio, cadastro e revisão diária), feito com Expo, Expo Router, NativeWind e `expo-sqlite`.

O app usa bibliotecas com código nativo, então roda em um **development build** (`expo-dev-client`), não no Expo Go.

## Pré-requisitos

- Node.js e npm
- Android Studio com Android SDK (variável `ANDROID_HOME` configurada)
- Um aparelho Android:
  - **Celular físico:** ative *Opções do desenvolvedor* → *Depuração USB*, conecte pelo cabo e autorize o computador;
  - **Emulador:** Android Studio → *Device Manager* → *Create Virtual Device* e inicie o emulador.

Confira se o aparelho aparece:

```bash
adb devices
```

## Instalação

```bash
npm install
```

## Rodando no Android

Compila o app nativo, instala no aparelho/emulador e inicia o Metro:

```bash
npx expo run:android   # ou: npm run android
```

A primeira compilação leva alguns minutos. Depois, se nada nativo mudou, basta subir o servidor com o app já instalado:

```bash
npx expo start         # ou: npm start
```

A pasta `android/` é gerada automaticamente (Continuous Native Generation) e não vai para o git. Não edite à mão — configure pelo `app.json` e config plugins.

## Qualidade

```bash
npm run lint           # npx expo lint
npm run typecheck      # npx tsc --noEmit
npm test               # vitest run
npx expo-doctor        # diagnostica dependências e configuração
```

## Dependências

Sempre instale pacotes com o Expo, para obter versões compatíveis com o SDK:

```bash
npx expo install <pacote>
npx expo install --fix   # corrige versões incompatíveis
```

## Build na nuvem (EAS)

```bash
npx eas-cli@latest build --profile development --platform android
```
