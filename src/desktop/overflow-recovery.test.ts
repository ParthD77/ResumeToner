import { describe, expect, it } from "vitest";
import type { SpaceRecovery } from "./contract";
import { selectVisibleRecoveries } from "./overflow-recovery";
import type { Review } from "./session";

const item = (id: string, strategy: SpaceRecovery["strategy"]): SpaceRecovery => ({
  id,
  strategy,
  title: id,
  currentLatex: `\\resumeItem{${id}}`,
  proposedLatex: strategy === "remove" ? "" : `\\resumeItem{Short ${id}}`,
  why: "Saves space.",
});
const review = (decision: Review["decision"]): Review => ({
  decision,
  text: "",
  scope: "current",
  syntheticVerified: false,
});

describe("overflow recovery visibility", () => {
  const one = item("one", "tighten");
  const two = item("two", "tighten");
  const remove = item("remove", "remove");
  const latex = [one, two, remove].map((x) => x.currentLatex).join("\n");

  it("hides all recovery cards when the resume fits", () => {
    expect(selectVisibleRecoveries(false, latex, [one, remove], {}, new Map([["one", 1]]))).toEqual([]);
  });

  it("ranks one-word then two-word tails before removals", () => {
    expect(selectVisibleRecoveries(true, latex, [remove, two, one], {}, new Map([["one", 1], ["two", 2]])).map((x) => x.id))
      .toEqual(["one", "two", "remove"]);
  });

  it("shows unconfirmed tightening suggestions and omits inapplicable targets", () => {
    const visible = selectVisibleRecoveries(
      true,
      one.currentLatex,
      [one, remove],
      { one: review("pending") },
      new Map(),
    );
    expect(visible.map((x) => x.id)).toEqual(["one"]);
  });
});
