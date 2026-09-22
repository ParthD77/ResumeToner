import type { SpaceRecovery } from "./contract";
import type { Review } from "./session";

export function selectVisibleRecoveries(
  overflow: boolean,
  latexBeforeRecovery: string,
  recoveries: SpaceRecovery[],
  reviews: Record<string, Review>,
  shortTailWords: Map<string, number>,
) {
  if (!overflow) return [];
  return recoveries
    .filter((item) => {
      const applicable = latexBeforeRecovery.split(item.currentLatex).length - 1 === 1;
      return applicable;
    })
    .sort((a, b) => {
      const rank = (item: SpaceRecovery) =>
        shortTailWords.get(item.id) ?? (item.strategy === "remove" ? 3 : 4);
      return rank(a) - rank(b);
    });
}
