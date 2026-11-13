import { StyleSheet, View } from "react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";

import { PAR_A_PAR_COLORS, PAR_A_PAR_METRICS } from "@/lib/presentation/theme/par-a-par-theme";

const GRID = PAR_A_PAR_METRICS.gridSize;

/** Squared paper of the site, drawn once behind the screen and ignored by touch and screen readers. */
export function PaperBackground() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="paper-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <Path
              d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
              fill="none"
              stroke={PAR_A_PAR_COLORS.paperLine}
              strokeWidth={1}
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={PAR_A_PAR_COLORS.paper} />
        <Rect width="100%" height="100%" fill="url(#paper-grid)" />
      </Svg>
    </View>
  );
}
