/**
 * Visual identity of "Par a Par", taken from the site (app-english/app/globals.css).
 * The site tokens are OKLCH; these are the same colors converted to sRGB hex.
 */
export const PAR_A_PAR_COLORS = {
  paper: "#FFF6E4",
  paperLine: "rgba(200, 180, 150, 0.24)",
  ink: "#081E34",
  inkMuted: "#3D5268",
  card: "#FFFDF5",
  primary: "#005B77",
  primaryLabel: "#FFFDF5",
  sun: "#F7E693",
  portugueseTile: "#F3E9D6",
  englishTile: "#AAEDC0",
  ring: "#005B77",
  error: "#BA1E20",
  errorTile: "#F6DCD3",
  track: "#EFE3CD",
} as const;

export const PAR_A_PAR_FONTS = {
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
  body: "NunitoSans_400Regular",
  bodyBold: "NunitoSans_700Bold",
  bodyHeavy: "NunitoSans_800ExtraBold",
} as const;

export const PAR_A_PAR_METRICS = {
  gridSize: 32,
  tileRadius: 14,
  tileBorder: 1.5,
  tileShadow: 3,
  selectedShadow: 4,
  focusRing: 3,
  tileHeight: 64,
  tileMinHeight: 44,
  brandMarkSize: 40,
  progressHeight: 8,
  eyebrowSize: 12,
  eyebrowSpacing: 1.6,
} as const;

/** Hard offset shadow of the site ("3px 3px 0 var(--foreground)"). */
export function hardShadow(offset: number = PAR_A_PAR_METRICS.tileShadow): string {
  return `${offset}px ${offset}px 0px ${PAR_A_PAR_COLORS.ink}`;
}
