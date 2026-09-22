import { describe, expect, it } from "vitest";
import {
  applyLatexChanges,
  applyRecoveryChanges,
  buildChatPrompt,
  parseTailoringResponse,
  validateLatexSource,
  validateResponseTargets,
} from "./contract";

const latex = String.raw`\documentclass{article}
\begin{document}
\resumeItem{Built typed REST APIs that reduced reconciliation time by 30\%}
\resumeItem{Used an outdated tool for routine work}
\end{document}`;
const valid = {
  company: "Example",
  role: "SWE",
  eligibility: {
    status: "eligible",
    summary: "No blocker found",
    blockers: [],
  },
  targetProfile: "A product engineer who ships tested APIs.",
  biggestGaps: [],
  keywordAnalysis: {
    covered: [{ keyword: "REST APIs", evidence: "Built typed REST APIs" }],
    missing: [{ keyword: "testing", importance: "required", proposalIds: ["change.1"] }],
  },
  researchNotes: [],
  proposals: [
    {
      id: "change.1",
      title: "Show API evidence",
      currentLatex: String.raw`\resumeItem{Built typed REST APIs that reduced reconciliation time by 30\%}`,
      proposedLatex: String.raw`\resumeItem{Built and tested typed REST APIs, reducing reconciliation time by 30\%}`,
      why: "Adds supported testing evidence.",
      recommendation: "ACCEPT",
      factuality: "verified",
    },
  ],
  spaceRecovery: [
    {
      id: "recovery.1",
      title: "Remove weak detail",
      currentLatex: String.raw`\resumeItem{Used an outdated tool for routine work}`,
      proposedLatex: "",
      why: "This detail is not relevant to the target role.",
      strategy: "remove",
    },
  ],
  syntheticIdeasToVerify: [],
  recruiterStory: "Tested product engineering.",
};

describe("desktop LaTeX ChatGPT contract", () => {
  it("parses fenced JSON and validates an exact unique target", () => {
    const parsed = parseTailoringResponse(
      `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``,
    );
    expect(validateResponseTargets(parsed, latex).proposals).toHaveLength(1);
  });
  it("discards ChatGPT citation placeholders without rejecting the response", () => {
    const changed = {
      ...structuredClone(valid),
      researchNotes: [
        {
          finding: "The role values Unix experience.",
          sourceTitle: "Role posting",
          sourceUrl: ":contentReference[oaicite:2]{index=2}",
        },
      ],
    };
    const parsed = parseTailoringResponse(JSON.stringify(changed));
    expect(parsed.researchNotes[0].sourceUrl).toBe("");
    expect(parsed.proposals).toHaveLength(1);
  });
  it("accepts quote-bearing citation markers injected into JSON strings", () => {
    const response = JSON.stringify(valid).replace(
      "No blocker found",
      String.raw`No blocker found :chatgpt-content-reference{index="0"}`,
    );
    const parsed = parseTailoringResponse(response);
    expect(parsed.eligibility.summary).toBe("No blocker found ");
  });
  it("keeps complete web research URLs", () => {
    const changed = {
      ...structuredClone(valid),
      researchNotes: [
        {
          finding: "The role values Unix experience.",
          sourceTitle: "Role posting",
          sourceUrl: "https://example.com/jobs/software-intern",
        },
      ],
    };
    const parsed = parseTailoringResponse(JSON.stringify(changed));
    expect(parsed.researchNotes[0].sourceUrl).toBe(
      "https://example.com/jobs/software-intern",
    );
  });
  it("rejects an absent source snippet", () => {
    const changed = structuredClone(valid);
    changed.proposals[0].currentLatex = String.raw`\resumeItem{Invented}`;
    expect(() =>
      validateResponseTargets(
        parseTailoringResponse(JSON.stringify(changed)),
        latex,
      ),
    ).toThrow(/matched 0/);
  });
  it("applies accepted current and base scopes deterministically", () => {
    const parsed = parseTailoringResponse(JSON.stringify(valid));
    const reviews = {
      "change.1": {
        decision: "accepted",
        text: parsed.proposals[0].proposedLatex,
        scope: "current",
      },
    };
    expect(
      applyLatexChanges(latex, parsed.proposals, reviews, "current"),
    ).toContain("Built and tested");
    expect(applyLatexChanges(latex, parsed.proposals, reviews, "base")).toBe(
      latex,
    );
  });
  it("validates and applies an accepted recovery after regular changes", () => {
    const parsed = validateResponseTargets(
      parseTailoringResponse(JSON.stringify(valid)),
      latex,
    );
    const recovered = applyRecoveryChanges(latex, parsed.spaceRecovery, {
      "recovery.1": { decision: "accepted", text: "" },
    });
    expect(recovered).not.toContain("outdated tool");
  });
  it("rejects duplicate and overlapping recovery targets", () => {
    const changed = structuredClone(valid);
    changed.spaceRecovery[0].id = "change.1";
    expect(() => validateResponseTargets(parseTailoringResponse(JSON.stringify(changed)), latex)).toThrow(/Duplicate/);

    const overlapping = structuredClone(valid);
    overlapping.spaceRecovery[0].id = "recovery.2";
    overlapping.spaceRecovery[0].currentLatex = valid.proposals[0].currentLatex;
    expect(() => validateResponseTargets(parseTailoringResponse(JSON.stringify(overlapping)), latex)).toThrow(/overlaps/);
  });
  it("requires tighten recoveries to target bullets", () => {
    const changed = structuredClone(valid);
    changed.spaceRecovery[0] = {
      ...changed.spaceRecovery[0],
      strategy: "tighten",
      currentLatex: String.raw`\begin{document}`,
      proposedLatex: String.raw`\begin{document}`,
    };
    expect(() => validateResponseTargets(parseTailoringResponse(JSON.stringify(changed)), latex)).toThrow(/resume bullet/);
  });
  it("rejects missing recovery targets and unknown strategies", () => {
    const missing = structuredClone(valid);
    missing.spaceRecovery[0].currentLatex = String.raw`\resumeItem{Not in the source}`;
    expect(() => validateResponseTargets(parseTailoringResponse(JSON.stringify(missing)), latex)).toThrow(/matched 0/);

    const invalid = structuredClone(valid) as unknown as { spaceRecovery: { strategy: string }[] };
    invalid.spaceRecovery[0].strategy = "compress";
    expect(() => parseTailoringResponse(JSON.stringify(invalid))).toThrow();
  });
  it("validates source and puts it in the prompt", () => {
    expect(validateLatexSource(latex)).toContain("documentclass");
    expect(
      buildChatPrompt(
        latex,
        "A detailed software engineering posting with APIs and testing.",
      ),
    ).toContain(latex);
    expect(
      buildChatPrompt(latex, "A sufficiently detailed job posting."),
    ).toContain("Never use citation placeholders");
    expect(
      buildChatPrompt(latex, "A sufficiently detailed job posting."),
    ).toContain("Always populate spaceRecovery");
    expect(buildChatPrompt(latex, "  Trim this posting.  ")).toContain(
      "JOB POSTING:\nTrim this posting.",
    );
    expect(
      buildChatPrompt(latex, "A sufficiently detailed job posting."),
    ).not.toMatch(/\{\{(?:RESPONSE_CONTRACT|LATEX|JOB_POSTING)\}\}/);
    expect(
      buildChatPrompt(
        latex.replace(
          "\\begin{document}",
          "\\begin{document}\n{{JOB_POSTING}}",
        ),
        "The actual posting",
      ),
    ).toContain("\\begin{document}\n{{JOB_POSTING}}");
  });
  it("rejects an unrendered placeholder template", () => {
    expect(() =>
      validateLatexSource(
        latex.replace("\\begin{document}", "\\begin{document}\n%%NAME%%"),
      ),
    ).toThrow(/unrendered/);
  });
});
