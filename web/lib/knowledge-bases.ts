export const KNOWLEDGE_BASES = [
  {
    value: "banks",
    label: "Banks",
    description: "Bank policies, risk notes, lending frameworks, and financial process guidance.",
  },
  {
    value: "power",
    label: "Power Plants",
    description: "Generation, operations, maintenance, and plant performance information.",
  },
  {
    value: "media",
    label: "Media / Television Networks",
    description: "Broadcast operations, programming strategy, editorial policy, and production context.",
  },
] as const;

export type KnowledgeBase = (typeof KNOWLEDGE_BASES)[number]["value"];

export type KnowledgeBaseOption = {
  value: KnowledgeBase;
  label: string;
  description: string;
};

export const KNOWLEDGE_BASE_MAP: Record<KnowledgeBase, KnowledgeBaseOption> = {
  banks: KNOWLEDGE_BASES[0],
  power: KNOWLEDGE_BASES[1],
  media: KNOWLEDGE_BASES[2],
};

export const DEFAULT_KNOWLEDGE_BASE: KnowledgeBase = "banks";

export function isKnowledgeBase(value: unknown): value is KnowledgeBase {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(KNOWLEDGE_BASE_MAP, value);
}
