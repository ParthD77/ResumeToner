import { z } from "zod";
import { extractJsonFromChat } from "../import-compat";
import tailoringPromptTemplate from "./tailoring-prompt.txt?raw";

const ResearchUrlSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return "";
    const candidate = value.trim();
    if (!/^https?:\/\//i.test(candidate)) return "";
    try {
      return new URL(candidate).toString();
    } catch {
      return "";
    }
  },
  z.string().url().or(z.literal("")),
);

export const DesktopProposalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  currentLatex: z.string().min(1).max(5000),
  proposedLatex: z.string().min(1).max(5000),
  why: z.string().min(1).max(2500),
  recommendation: z.enum(["STRONGLY ACCEPT", "ACCEPT", "OPTIONAL", "REJECT"]),
  factuality: z.enum(["verified", "extrapolated", "synthetic"]),
});

export const SpaceRecoverySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  currentLatex: z.string().min(1).max(5000),
  proposedLatex: z.string().max(5000),
  why: z.string().min(1).max(2500),
  strategy: z.enum(["remove", "tighten"]),
});

const KeywordSchema = z.string().trim().min(1).max(100);
const KeywordAnalysisSchema = z.object({
  covered: z
    .array(
      z.object({
        keyword: KeywordSchema,
        evidence: z.string().trim().min(1).max(500),
      }),
    )
    .max(40)
    .default([]),
  missing: z
    .array(
      z.object({
        keyword: KeywordSchema,
        importance: z.enum(["required", "preferred"]),
        proposalIds: z.array(z.string().min(1)).max(20).default([]),
      }),
    )
    .max(40)
    .default([]),
});

export const TailoringResponseSchema = z.object({
  company: z.string().default(""),
  role: z.string().default(""),
  eligibility: z.object({
    status: z.enum(["eligible", "possible_blocker", "hard_blocker", "unknown"]),
    summary: z.string(),
    blockers: z.array(z.string()).default([]),
  }),
  targetProfile: z.string().min(1),
  biggestGaps: z.array(z.string()).max(8).default([]),
  keywordAnalysis: KeywordAnalysisSchema.default({
    covered: [],
    missing: [],
  }),
  researchNotes: z
    .array(
      z.object({
        finding: z.string(),
        sourceTitle: z.string().default(""),
        // ChatGPT sometimes emits an internal :contentReference marker even
        // when asked for a URL. Research links are optional, so discard those
        // markers instead of rejecting an otherwise useful response.
        sourceUrl: ResearchUrlSchema.default(""),
      }),
    )
    .default([]),
  proposals: z.array(DesktopProposalSchema).max(20),
  spaceRecovery: z.array(SpaceRecoverySchema).max(12).default([]),
  syntheticIdeasToVerify: z.array(z.string()).default([]),
  recruiterStory: z.string().default(""),
});

export type TailoringResponse = z.infer<typeof TailoringResponseSchema>;
export type DesktopProposal = z.infer<typeof DesktopProposalSchema>;
export type SpaceRecovery = z.infer<typeof SpaceRecoverySchema>;

export function parseTailoringResponse(value: string) {
  return TailoringResponseSchema.parse(extractJsonFromChat(value));
}

export function validateLatexSource(value: string) {
  const latex = value.trim();
  if (
    !latex.includes("\\documentclass") ||
    !latex.includes("\\begin{document}") ||
    !latex.includes("\\end{document}")
  )
    throw new Error(
      "Choose a complete LaTeX resume containing documentclass and a document environment.",
    );
  if (/%%[A-Z_]+%%/.test(latex))
    throw new Error(
      "This is an unrendered LaTeX template with %%PLACEHOLDER%% fields. Open the generated current.tex resume instead.",
    );
  if (latex.length > 500_000)
    throw new Error("The LaTeX source is larger than 500 KB.");
  return `${latex}\n`;
}

export function validateResponseTargets(
  response: TailoringResponse,
  latex: string,
) {
  const seen = new Set<string>();
  for (const proposal of response.proposals) {
    if (seen.has(proposal.id))
      throw new Error(`Duplicate proposal ID: ${proposal.id}`);
    seen.add(proposal.id);
    const occurrences = latex.split(proposal.currentLatex).length - 1;
    if (occurrences !== 1)
      throw new Error(
        `${proposal.id} must target one exact LaTeX snippet, but it matched ${occurrences}. Nothing was imported.`,
      );
    if (!proposal.proposedLatex.includes("\\"))
      throw new Error(`${proposal.id} proposedLatex does not look like LaTeX.`);
  }
  const proposalIds = new Set(seen);
  const targets: { id: string; currentLatex: string }[] = [...response.proposals];
  for (const recovery of response.spaceRecovery) {
    if (seen.has(recovery.id))
      throw new Error(`Duplicate proposal or recovery ID: ${recovery.id}`);
    seen.add(recovery.id);
    const occurrences = latex.split(recovery.currentLatex).length - 1;
    if (occurrences !== 1)
      throw new Error(
        `${recovery.id} must target one exact LaTeX snippet, but it matched ${occurrences}. Nothing was imported.`,
      );
    if (!recovery.currentLatex.includes("\\"))
      throw new Error(`${recovery.id} currentLatex does not look like LaTeX.`);
    if (recovery.strategy === "tighten") {
      if (!/\\(?:resumeItem|resumeSubItem|item)\b/.test(recovery.currentLatex))
        throw new Error(`${recovery.id} must target a resume bullet to tighten it.`);
      if (!recovery.proposedLatex.includes("\\"))
        throw new Error(`${recovery.id} proposedLatex does not look like LaTeX.`);
    }
    for (const target of targets) {
      if (
        target.currentLatex.includes(recovery.currentLatex) ||
        recovery.currentLatex.includes(target.currentLatex)
      )
        throw new Error(
          `${recovery.id} overlaps ${target.id}. Recovery targets must be independent of normal proposals and each other.`,
        );
    }
    targets.push(recovery);
  }
  for (const keyword of response.keywordAnalysis.missing) {
    const unknown = keyword.proposalIds.filter((id) => !proposalIds.has(id));
    if (unknown.length > 0)
      throw new Error(
        `Keyword ${keyword.keyword} references unknown proposal IDs: ${unknown.join(", ")}.`,
      );
  }
  return response;
}

export function applyLatexChanges(
  latex: string,
  proposals: DesktopProposal[],
  reviews: Record<string, { decision: string; text: string; scope: string }>,
  include: "current" | "base",
) {
  let output = latex;
  for (const proposal of proposals) {
    const review = reviews[proposal.id];
    if (
      !review ||
      review.decision !== "accepted" ||
      (include === "base" && review.scope !== "base")
    )
      continue;
    const occurrences = output.split(proposal.currentLatex).length - 1;
    if (occurrences !== 1)
      throw new Error(
        `${proposal.id} can no longer be applied uniquely. Reset the run and import the response again.`,
      );
    output = output.replace(proposal.currentLatex, review.text);
  }
  return output;
}

export function applyRecoveryChanges(
  latex: string,
  recoveries: SpaceRecovery[],
  reviews: Record<string, { decision: string; text: string }>,
) {
  let output = latex;
  for (const recovery of recoveries) {
    const review = reviews[recovery.id];
    if (!review || review.decision !== "accepted") continue;
    const occurrences = output.split(recovery.currentLatex).length - 1;
    if (occurrences !== 1) continue;
    output = output.replace(recovery.currentLatex, review.text);
  }
  return output;
}

const RESPONSE_CONTRACT = `{
  "company":"Company", "role":"Role",
  "eligibility":{"status":"eligible|possible_blocker|hard_blocker|unknown","summary":"...","blockers":[]},
  "targetProfile":"3-6 line summary", "biggestGaps":["..."],
  "keywordAnalysis":{"covered":[{"keyword":"exact job-posting term","evidence":"short quote or location in the current resume"}],"missing":[{"keyword":"exact job-posting term","importance":"required|preferred","proposalIds":["change.1"]}]},
  "researchNotes":[{"finding":"...","sourceTitle":"...","sourceUrl":"https://..."}],
  "proposals":[{"id":"change.1","title":"Short name","currentLatex":"one exact, unique, complete LaTeX command or block copied verbatim from the source","proposedLatex":"the complete replacement LaTeX command or block","why":"...","recommendation":"STRONGLY ACCEPT|ACCEPT|OPTIONAL|REJECT","factuality":"verified|extrapolated|synthetic"}],
  "spaceRecovery":[{"id":"recovery.1","title":"Short name","currentLatex":"one exact, unique LaTeX command or block copied verbatim from the source","proposedLatex":"a shorter replacement, or an empty string only when removing the target","why":"why this content can be shortened or removed without weakening a required qualification","strategy":"remove|tighten"}],
  "syntheticIdeasToVerify":["..."], "recruiterStory":"..."
}`;

export function buildChatPrompt(latex: string, jobPosting: string) {
  const values = {
    RESPONSE_CONTRACT,
    LATEX: latex,
    JOB_POSTING: jobPosting.trim(),
  };
  const used = new Set<string>();
  // Normalize the checked-in template so generated prompts are identical on
  // Windows and Unix checkouts (and safe for callers/tests that use `\n`).
  const prompt = tailoringPromptTemplate.replace(/\r\n?/g, "\n").replace(
    /{{(RESPONSE_CONTRACT|LATEX|JOB_POSTING)}}/g,
    (_placeholder, key: keyof typeof values) => {
      used.add(key);
      return values[key];
    },
  );

  const missing = Object.keys(values).filter((key) => !used.has(key));
  if (missing.length > 0)
    throw new Error(
      `The tailoring prompt template is missing: ${missing.join(", ")}`,
    );

  return prompt.trimEnd();
}
