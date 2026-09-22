import { describe, expect, it } from "vitest";
import type { TailoringResponse } from "./contract";
import { groupKeywordCoverage } from "./keyword-coverage";
import type { Review } from "./session";

const result = {
  keywordAnalysis: {
    covered: [{ keyword: "React", evidence: "Skills section" }],
    missing: [
      { keyword: "TypeScript", importance: "required", proposalIds: ["change.1"] },
      { keyword: "AWS", importance: "preferred", proposalIds: ["change.2"] },
      { keyword: "Kubernetes", importance: "preferred", proposalIds: [] },
    ],
  },
} as TailoringResponse;

const review = (decision: Review["decision"]): Review => ({ decision, text: "", scope: "current", syntheticVerified: false });

describe("keyword coverage grouping", () => {
  it("tracks accepted, pending, rejected, and unaddressed gaps", () => {
    const grouped = groupKeywordCoverage(result, {
      "change.1": review("accepted"),
      "change.2": review("pending"),
    });
    expect(grouped.covered.map((x) => x.keyword)).toEqual(["React"]);
    expect(grouped.added.map((x) => x.keyword)).toEqual(["TypeScript"]);
    expect(grouped.suggested.map((x) => x.keyword)).toEqual(["AWS"]);
    expect(grouped.remaining.map((x) => x.keyword)).toEqual(["Kubernetes"]);
  });
});
