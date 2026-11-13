import { StyleSheet, Text, View } from "react-native";

import {
  PAR_A_PAR_COLORS,
  PAR_A_PAR_FONTS,
  PAR_A_PAR_METRICS,
  hardShadow,
} from "@/lib/presentation/theme/par-a-par-theme";

const BRAND_NAME = "Par a Par";
const MARK_TILT = "-4deg";
const MARK_BORDER = 2;

/** The site's "P²" mark next to the name. */
export function BrandLockup() {
  return (
    <View accessible accessibilityLabel={BRAND_NAME} style={styles.lockup}>
      <View style={styles.mark}>
        <Text style={styles.markText}>
          P<Text style={styles.markSup}>²</Text>
        </Text>
      </View>
      <Text style={styles.name}>{BRAND_NAME}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mark: {
    width: PAR_A_PAR_METRICS.brandMarkSize,
    height: PAR_A_PAR_METRICS.brandMarkSize,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: MARK_BORDER,
    borderColor: PAR_A_PAR_COLORS.ink,
    borderTopLeftRadius: 17,
    borderTopRightRadius: 23,
    borderBottomRightRadius: 19,
    borderBottomLeftRadius: 21,
    backgroundColor: PAR_A_PAR_COLORS.sun,
    boxShadow: hardShadow(),
    transform: [{ rotate: MARK_TILT }],
  },
  markText: {
    color: PAR_A_PAR_COLORS.ink,
    fontFamily: PAR_A_PAR_FONTS.display,
    fontSize: 16,
  },
  markSup: {
    fontSize: 11,
  },
  name: {
    color: PAR_A_PAR_COLORS.ink,
    fontFamily: PAR_A_PAR_FONTS.display,
    fontSize: 17,
    letterSpacing: -0.4,
  },
});
