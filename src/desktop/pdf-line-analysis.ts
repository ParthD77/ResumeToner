import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { SpaceRecovery } from "./contract";
import { readableLatex } from "./readable-latex";

GlobalWorkerOptions.workerSrc = workerUrl;

export type RenderedLine = { page: number; y: number; text: string };

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[•●▪◦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function findShortTailRecoveries(
  lines: RenderedLine[],
  recoveries: SpaceRecovery[],
) {
  const tailWords = new Map<string, number>();
  let matchedTargets = 0;

  for (const recovery of recoveries.filter((item) => item.strategy === "tighten")) {
    const target = normalize(readableLatex(recovery.currentLatex));
    const matches: { end: number; start: number }[] = [];
    for (let start = 0; start < lines.length; start += 1) {
      let combined = "";
      for (let end = start; end < lines.length && end < start + 8; end += 1) {
        if (lines[end].page !== lines[start].page) break;
        combined = normalize(`${combined} ${lines[end].text}`);
        if (combined === target) {
          matches.push({ start, end });
          break;
        }
        if (combined.length > target.length + 20) break;
      }
    }
    if (matches.length !== 1) continue;
    matchedTargets += 1;
    const lastLine = normalize(lines[matches[0].end].text);
    const count = lastLine.split(/\s+/).filter(Boolean).length;
    if (count === 1 || count === 2) tailWords.set(recovery.id, count);
  }

  return { tailWords, matchedTargets };
}

/** Backward-compatible fallback for a renderer hot-reloaded against an older Electron main process. */
export async function getPdfPageCount(pdf: ArrayBuffer) {
  const loadingTask = getDocument({ data: new Uint8Array(pdf.slice(0)) });
  try {
    const document = await loadingTask.promise;
    return document.numPages;
  } finally {
    await loadingTask.destroy();
  }
}

export async function extractRenderedLines(pdf: ArrayBuffer): Promise<RenderedLine[]> {
  const loadingTask = getDocument({ data: new Uint8Array(pdf.slice(0)) });
  const document = await loadingTask.promise;
  const lines: RenderedLine[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is typeof item & { str: string; transform: number[]; width: number; height: number } => "str" in item)
      .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5], height: item.height || 10 }))
      .filter((item) => item.text.trim());
    const groups: { y: number; height: number; items: typeof items }[] = [];
    for (const item of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const group = groups.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2, candidate.height * 0.35));
      if (group) group.items.push(item);
      else groups.push({ y: item.y, height: item.height, items: [item] });
    }
    for (const group of groups.sort((a, b) => b.y - a.y)) {
      lines.push({
        page: pageNumber,
        y: group.y,
        text: group.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "),
      });
    }
  }
  await loadingTask.destroy();
  return lines;
}
