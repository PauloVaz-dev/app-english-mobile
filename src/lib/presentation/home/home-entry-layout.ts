import { formatReviewCounts, type HomeReviewSummaryView } from "@/lib/presentation/review/home-review-copy";

export const HOME_ENTRY_BADGE = "Vocabulário que fica";
export const HOME_ENTRY_TITLE_LEAD = "Treine palavras.";
export const HOME_ENTRY_TITLE_EMPHASIS = "Lembre de verdade.";
export const HOME_ENTRY_INTRO =
  "Revise o que venceu hoje, conheça poucas palavras novas e treine no seu ritmo. Sem cadastro.";
export const HOME_ENTRY_CARD_LABEL = "Revisão de hoje";

export const HOME_ENTRY_PALETTE = {
  canvas: "#F4F0E6",
  ink: "#1C2740",
  emphasis: "#C44536",
  muted: "#5C6570",
  card: "#FFFFFF",
  cardBorder: "#E4DDD0",
  primary: "#0F6E78",
  primaryLabel: "#FFFFFF",
  secondary: "#F7F3EA",
  secondaryBorder: "#E0D8C8",
} as const;

export const HOME_ENTRY_METRICS = {
  screenPadding: 24,
  sectionGap: 20,
  cardPadding: 16,
  cardRadius: 20,
  actionGap: 10,
  minTouchTarget: 44,
  badgeSize: 12,
  badgeLetterSpacing: 0.6,
  titleSize: 40,
  titleLineHeight: 44,
  introSize: 16,
  introLineHeight: 24,
  cardLabelSize: 13,
  summarySize: 18,
  actionRadius: 14,
} as const;

export type HomeActionEmphasis = "primary" | "secondary";

export interface HomeEntryAction {
  readonly href: "/revisar" | "/treino-livre" | "/desafio" | "/palavras";
  readonly label: string;
  readonly emphasis: HomeActionEmphasis;
}

export interface HomeEntryLayout {
  readonly badge: string;
  readonly titleLead: string;
  readonly titleEmphasis: string;
  readonly intro: string;
  readonly cardLabel: string;
  readonly cardSummary: string;
  readonly cardDetail: string | null;
  readonly actions: readonly HomeEntryAction[];
}

const HOME_ENTRY_ACTIONS: readonly HomeEntryAction[] = [
  { href: "/revisar", label: "Revisar hoje", emphasis: "primary" },
  { href: "/treino-livre", label: "Treino livre", emphasis: "secondary" },
  { href: "/desafio", label: "Desafio", emphasis: "secondary" },
  { href: "/palavras", label: "Palavras", emphasis: "secondary" },
];

export function homeEntryLayout(view: HomeReviewSummaryView): HomeEntryLayout {
  return {
    badge: HOME_ENTRY_BADGE,
    titleLead: HOME_ENTRY_TITLE_LEAD,
    titleEmphasis: HOME_ENTRY_TITLE_EMPHASIS,
    intro: HOME_ENTRY_INTRO,
    cardLabel: HOME_ENTRY_CARD_LABEL,
    cardSummary: cardSummary(view),
    cardDetail: cardDetail(view),
    actions: HOME_ENTRY_ACTIONS,
  };
}

export function homeEntryAnnouncement(view: HomeReviewSummaryView): string {
  if (view.nothingToReviewTitle === null) {
    return formatReviewCounts(view.dueCount, view.newAvailable);
  }
  if (view.nextReviewDetail === null) {
    return view.nothingToReviewTitle;
  }
  return `${view.nothingToReviewTitle}. ${view.nextReviewDetail}`;
}

function cardSummary(view: HomeReviewSummaryView): string {
  if (view.nothingToReviewTitle === null) {
    return formatReviewCounts(view.dueCount, view.newAvailable);
  }
  return view.nothingToReviewTitle;
}

function cardDetail(view: HomeReviewSummaryView): string | null {
  if (view.nothingToReviewTitle === null) {
    return null;
  }
  return view.nextReviewDetail;
}
