import type { TailoringResponse } from "./contract";
import type { Review } from "./session";

export type MissingKeyword = TailoringResponse["keywordAnalysis"]["missing"][number];

export function groupKeywordCoverage(
  result: TailoringResponse,
  reviews: Record<string, Review>,
) {
  const suggested: MissingKeyword[] = [];
  const added: MissingKeyword[] = [];
  const remaining: MissingKeyword[] = [];

  for (const keyword of result.keywordAnalysis.missing) {
    const decisions = keyword.proposalIds.map(
      (id) => reviews[id]?.decision ?? "rejected",
    );
    if (decisions.includes("accepted")) added.push(keyword);
    else if (decisions.includes("pending")) suggested.push(keyword);
    else remaining.push(keyword);
  }

  return { covered: result.keywordAnalysis.covered, suggested, added, remaining };
}
