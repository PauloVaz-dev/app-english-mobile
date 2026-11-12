import { Image } from "expo-image";
import { Moon } from "lucide-react-native";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export function SignInScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#0d0e10]">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow justify-center px-4 py-6"
        >
          <Card className="w-full max-w-md self-center border-white/15 bg-[#2a2c31] py-6 shadow-black/40">
            <CardContent className="gap-6">
              <View className="flex-row items-center justify-between">
                <Image
                  source={require("@/assets/images/logo.svg")}
                  style={{ width: 72, height: 72 }}
                  contentFit="contain"
                  accessibilityLabel="Solar Life Energy"
                />
                <Button
                  variant="outline"
                  size="icon"
                  accessibilityLabel="Alternar tema"
                  className="border-white/20 bg-transparent"
                >
                  <Moon color="#ffffff" size={18} />
                </Button>
              </View>

              <View className="items-center gap-2">
                <Text className="text-center text-xl font-semibold text-white">
                  Bem-vindo,{" "}
                  <Text className="text-xl font-bold text-[#077AB0]">Solar Life E...!</Text>
                </Text>
                <Text className="text-center text-sm text-white/70">Acesse sua conta abaixo.</Text>
              </View>

              <View className="gap-4">
                <View className="gap-1">
                  <Text className="text-sm font-medium text-white">Seu e-mail</Text>
                  <Input
                    placeholder="Digite seu e-mail"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholderTextColor="#9ca3af"
                    className="h-11 border-white/25 bg-transparent px-4 text-white"
                  />
                </View>
                <View className="gap-1">
                  <Text className="text-sm font-medium text-white">Sua Senha</Text>
                  <Input
                    placeholder="Digite sua senha"
                    secureTextEntry
                    autoComplete="password"
                    placeholderTextColor="#9ca3af"
                    className="h-11 border-white/25 bg-transparent px-4 text-white"
                  />
                </View>
                <Button className="h-12 w-full bg-[#077AB0] active:bg-[#066894]">
                  <Text className="text-base font-medium text-white">Entrar no SCE</Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
