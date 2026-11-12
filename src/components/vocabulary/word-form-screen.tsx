import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";

import { createInstalledWordRegistration } from "@/composition/installed-word-registration";
import { HOME_ENTRY_METRICS, HOME_ENTRY_PALETTE } from "@/lib/presentation/home/home-entry-layout";
import {
  INITIAL_WORD_FORM_STATE,
  WORD_FORM_BACK,
  WORD_FORM_MIN_TOUCH_TARGET,
  WordFormController,
  wordFormView,
  type WordFormField,
  type WordFormFieldView,
  type WordFormNoticeView,
  type WordFormState,
} from "@/lib/presentation/vocabulary/word-form";

const BORDER_WIDTH = 1;
const ERROR_BORDER_WIDTH = 2;
const FIELD_GAP = 6;
const SENTENCE_MIN_HEIGHT = 88;

/** The mounted inputs, kept outside render so the controller can move the focus. */
type FieldInputs = Map<WordFormField, TextInputInstance>;

export function WordFormScreen() {
  const { state, controller, inputs } = useWordForm();
  const view = wordFormView(state);
  const submit = () => void controller.submit();
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <View style={styles.hero}>
          <Text accessibilityRole="header" style={styles.title}>
            {view.title}
          </Text>
          <Text style={styles.intro}>{view.intro}</Text>
        </View>
        <View style={styles.card}>
          {view.fields.map((field, index) => {
            const next = view.fields[index + 1];
            return (
              <FormField
                key={field.field}
                field={field}
                inputRef={(node) => {
                  if (node === null) {
                    inputs.delete(field.field);
                  } else {
                    inputs.set(field.field, node);
                  }
                }}
                onChange={(value) => controller.change(field.field, value)}
                onSubmitEditing={
                  next === undefined ? submit : () => inputs.get(next.field)?.focus()
                }
                last={next === undefined}
              />
            );
          })}
        </View>
        {view.notice === null ? null : <Notice notice={view.notice} />}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={view.submit.accessibilityLabel}
            accessibilityState={{ disabled: view.submit.disabled, busy: state.saving }}
            disabled={view.submit.disabled}
            onPress={submit}
            style={[styles.primaryTarget, view.submit.disabled ? styles.disabledTarget : null]}
          >
            <Text style={styles.primaryLabel}>{view.submit.label}</Text>
          </Pressable>
          <Link href="/" dismissTo asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={WORD_FORM_BACK.accessibilityLabel}
              style={styles.secondaryTarget}
            >
              <Text style={styles.secondaryLabel}>{WORD_FORM_BACK.label}</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** One controller and one registration per visit; leaving the route drops unsaved text. */
function useWordForm(): {
  state: WordFormState;
  controller: WordFormController;
  inputs: FieldInputs;
} {
  const [inputs] = useState<FieldInputs>(() => new Map());
  const [state, setState] = useState<WordFormState>(INITIAL_WORD_FORM_STATE);
  const [controller] = useState(
    () =>
      new WordFormController({
        registration: createInstalledWordRegistration(),
        onChange: setState,
        focus: (field) => inputs.get(field)?.focus(),
        announce: (text) => AccessibilityInfo.announceForAccessibility(text),
      }),
  );
  return { state, controller, inputs };
}

function FormField({
  field,
  inputRef,
  onChange,
  onSubmitEditing,
  last,
}: {
  field: WordFormFieldView;
  inputRef: (node: TextInputInstance | null) => void;
  onChange: (value: string) => void;
  onSubmitEditing: () => void;
  last: boolean;
}) {
  const sentence = field.field === "exampleSentence";
  return (
    <View style={styles.field}>
      <Text importantForAccessibility="no" accessibilityElementsHidden style={styles.label}>
        {field.label} <Text style={styles.marker}>({field.marker})</Text>
      </Text>
      <TextInput
        ref={inputRef}
        value={field.value}
        onChangeText={onChange}
        accessibilityLabel={field.accessibilityLabel}
        accessibilityHint={field.accessibilityHint}
        autoCapitalize={sentence ? "sentences" : "none"}
        autoCorrect={sentence}
        multiline={sentence}
        returnKeyType={last ? "done" : "next"}
        submitBehavior={last ? "blurAndSubmit" : "submit"}
        onSubmitEditing={onSubmitEditing}
        style={[
          styles.input,
          sentence ? styles.sentenceInput : null,
          field.error === null ? null : styles.inputError,
        ]}
      />
      {field.error === null ? null : (
        <Text importantForAccessibility="no" accessibilityElementsHidden style={styles.errorText}>
          {field.error}
        </Text>
      )}
    </View>
  );
}

function Notice({ notice }: { notice: WordFormNoticeView }) {
  const alert = notice.tone === "alert";
  return (
    <View
      accessibilityRole={alert ? "alert" : "text"}
      style={[styles.card, alert ? styles.alertCard : styles.successCard]}
    >
      <Text style={alert ? styles.alertText : styles.successText}>{notice.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: HOME_ENTRY_PALETTE.canvas,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: HOME_ENTRY_METRICS.screenPadding,
    gap: HOME_ENTRY_METRICS.sectionGap,
  },
  hero: {
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  title: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.titleSize,
    fontWeight: "700",
    lineHeight: HOME_ENTRY_METRICS.titleLineHeight,
  },
  intro: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.introSize,
    lineHeight: HOME_ENTRY_METRICS.introLineHeight,
  },
  card: {
    gap: HOME_ENTRY_METRICS.cardPadding,
    padding: HOME_ENTRY_METRICS.cardPadding,
    borderRadius: HOME_ENTRY_METRICS.cardRadius,
    borderCurve: "continuous",
    borderWidth: BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.cardBorder,
    backgroundColor: HOME_ENTRY_PALETTE.card,
  },
  field: {
    gap: FIELD_GAP,
  },
  label: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.introSize,
    fontWeight: "600",
  },
  marker: {
    color: HOME_ENTRY_PALETTE.muted,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
    fontWeight: "400",
  },
  input: {
    minHeight: WORD_FORM_MIN_TOUCH_TARGET,
    paddingHorizontal: HOME_ENTRY_METRICS.actionGap,
    paddingVertical: FIELD_GAP,
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.secondaryBorder,
    backgroundColor: HOME_ENTRY_PALETTE.secondary,
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  sentenceInput: {
    minHeight: SENTENCE_MIN_HEIGHT,
    textAlignVertical: "top",
  },
  inputError: {
    borderWidth: ERROR_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.emphasis,
  },
  errorText: {
    color: HOME_ENTRY_PALETTE.emphasis,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
    fontWeight: "600",
  },
  alertCard: {
    borderColor: HOME_ENTRY_PALETTE.emphasis,
  },
  successCard: {
    borderColor: HOME_ENTRY_PALETTE.primary,
  },
  alertText: {
    color: HOME_ENTRY_PALETTE.emphasis,
    fontSize: HOME_ENTRY_METRICS.introSize,
    fontWeight: "600",
  },
  successText: {
    color: HOME_ENTRY_PALETTE.primary,
    fontSize: HOME_ENTRY_METRICS.introSize,
    fontWeight: "600",
  },
  actions: {
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  primaryTarget: {
    minHeight: WORD_FORM_MIN_TOUCH_TARGET,
    minWidth: WORD_FORM_MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    backgroundColor: HOME_ENTRY_PALETTE.primary,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    paddingVertical: HOME_ENTRY_METRICS.actionGap,
  },
  disabledTarget: {
    opacity: 0.6,
  },
  secondaryTarget: {
    minHeight: WORD_FORM_MIN_TOUCH_TARGET,
    minWidth: WORD_FORM_MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.secondaryBorder,
    backgroundColor: HOME_ENTRY_PALETTE.secondary,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    paddingVertical: HOME_ENTRY_METRICS.actionGap,
  },
  primaryLabel: {
    color: HOME_ENTRY_PALETTE.primaryLabel,
    fontSize: HOME_ENTRY_METRICS.introSize,
    fontWeight: "600",
  },
  secondaryLabel: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
});
