import { describe, expect, it } from "vitest";
import type { SpaceRecovery } from "./contract";
import { findShortTailRecoveries, type RenderedLine } from "./pdf-line-analysis";

const recovery = (id: string, text: string): SpaceRecovery => ({
  id,
  title: "Tighten bullet",
  currentLatex: `\\resumeItem{${text}}`,
  proposedLatex: `\\resumeItem{Shorter ${text}}`,
  why: "Avoid a short final line.",
  strategy: "tighten",
});

describe("rendered PDF short-line analysis", () => {
  it("flags unique one- and two-word bullet tails", () => {
    const lines: RenderedLine[] = [
      { page: 1, y: 100, text: "• Built a reliable service with" },
      { page: 1, y: 90, text: "Kubernetes" },
      { page: 1, y: 70, text: "• Shipped typed APIs using" },
      { page: 1, y: 60, text: "React Query" },
    ];
    const result = findShortTailRecoveries(lines, [
      recovery("one", "Built a reliable service with Kubernetes"),
      recovery("two", "Shipped typed APIs using React Query"),
    ]);
    expect(Object.fromEntries(result.tailWords)).toEqual({ one: 1, two: 2 });
  });

  it("does not flag a final line with three words", () => {
    const result = findShortTailRecoveries(
      [
        { page: 1, y: 100, text: "• Built a reliable service with" },
        { page: 1, y: 90, text: "the Kubernetes platform" },
      ],
      [recovery("three", "Built a reliable service with the Kubernetes platform")],
    );
    expect(result.tailWords.size).toBe(0);
    expect(result.matchedTargets).toBe(1);
  });

  it("handles a separate bullet glyph and rejects ambiguous matches", () => {
    const candidate = recovery("duplicate", "Built APIs");
    const lines: RenderedLine[] = [
      { page: 1, y: 100, text: "•" },
      { page: 1, y: 100, text: "Built APIs" },
      { page: 2, y: 100, text: "• Built APIs" },
    ];
    expect(findShortTailRecoveries(lines, [candidate]).matchedTargets).toBe(0);
  });

  it("returns no match when extracted text differs", () => {
    const result = findShortTailRecoveries(
      [{ page: 1, y: 100, text: "Different bullet" }],
      [recovery("missing", "Built APIs")],
    );
    expect(result).toEqual({ tailWords: new Map(), matchedTargets: 0 });
  });
});
