import { useEffect, useMemo, useState } from "react";
import { ResumeComparison } from "./ResumeComparison";
import { KeywordCoverage } from "./KeywordCoverage";
import { editReadableLatex } from "./editable-latex";
import { extractRenderedLines, findShortTailRecoveries, getPdfPageCount } from "./pdf-line-analysis";
import { selectVisibleRecoveries } from "./overflow-recovery";
import { ArchiveSchema, SESSION_KEY, addSnapshot, emptySession, readArchive, type Archive, type Review, type Session } from "./session";
import {
  applyLatexChanges,
  applyRecoveryChanges,
  buildChatPrompt,
  parseTailoringResponse,
  validateLatexSource,
  validateResponseTargets,
  type TailoringResponse,
} from "./contract";

export function DesktopApp() {
  const desktopPlatform = window.resumeDesktop?.platform ?? {
    osLabel: "DESKTOP",
    latexDistribution: "TeX",
  };
  const [initial] = useState(() => {
    try { return { archive: readArchive(localStorage), error: "" }; }
    catch { return { archive: { version: 1 as const, session: emptySession(), history: [] }, error: "Saved session could not be read. Export a backup of the stored data before replacing it." }; }
  });
  const [savedBase, setSavedBase] = useState(initial.archive.session.savedBase);
  const [base, setBase] = useState(initial.archive.session.base);
  const [latexInput, setLatexInput] = useState(initial.archive.session.latexInput);
  const [job, setJob] = useState(initial.archive.session.job);
  const [responseText, setResponseText] = useState(initial.archive.session.responseText);
  const [result, setResult] = useState<TailoringResponse | null>(initial.archive.session.result);
  const [reviews, setReviews] = useState<Record<string, Review>>(initial.archive.session.reviews);
  const [recoveryReviews, setRecoveryReviews] = useState<Record<string, Review>>(initial.archive.session.recoveryReviews);
  const [sideOpen, setSideOpen] = useState(initial.archive.session.sideOpen);
  const [history, setHistory] = useState<Archive["history"]>(initial.archive.history);
  const [storageError, setStorageError] = useState(initial.error);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState("");
  const [compileLog, setCompileLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [resumeFilename, setResumeFilename] = useState("Resume.pdf");
  const [targetPageCount, setTargetPageCount] = useState<number | null>(null);
  const [currentPageCount, setCurrentPageCount] = useState<number | null>(null);
  const [shortTailWords, setShortTailWords] = useState<Map<string, number>>(new Map());
  const [lineAnalysisMessage, setLineAnalysisMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void window.resumeDesktop?.getResumeFilename().then(setResumeFilename);
  }, []);

  const session = useMemo<Session>(() => ({ savedBase, base, latexInput, job, responseText, result, reviews, recoveryReviews, sideOpen }), [savedBase, base, latexInput, job, responseText, result, reviews, recoveryReviews, sideOpen]);
  useEffect(() => {
    if (initial.error) return; // Never overwrite unreadable saved data automatically.
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, session, history }));
      setStorageError("");
    } catch { setStorageError("Local autosave failed (storage may be full). Download a backup before closing the app."); }
  }, [session, history, initial.error]);
  const checkpoint = (label: string) => setHistory(all => addSnapshot(all, session, label));
  const restore = (value: Session) => {
    setSavedBase(value.savedBase); setBase(value.base); setLatexInput(value.latexInput);
    setJob(value.job); setResponseText(value.responseText); setResult(value.result);
    setReviews(value.reviews); setRecoveryReviews(value.recoveryReviews); setSideOpen(value.sideOpen); setPreview(""); setError("");
  };
  const baseAfterReview = useMemo(
    () =>
      base && result
        ? applyLatexChanges(base, result.proposals, reviews, "base")
        : base,
    [base, result, reviews],
  );
  const currentBeforeRecovery = useMemo(
    () =>
      base && result
        ? applyLatexChanges(base, result.proposals, reviews, "current")
        : base,
    [base, result, reviews],
  );
  const current = useMemo(
    () => result ? applyRecoveryChanges(currentBeforeRecovery, result.spaceRecovery, recoveryReviews) : currentBeforeRecovery,
    [currentBeforeRecovery, result, recoveryReviews],
  );

  const guard = async (fn: () => Promise<void> | void) => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const saveBase = (latex: string) => {
    const valid = validateLatexSource(latex);
    setSavedBase(valid);
    setBase(valid);
  };
  const setReview = (id: string, patch: Partial<Review>) =>
    setReviews((all) => ({ ...all, [id]: { ...all[id], ...patch } }));
  const setRecoveryReview = (id: string, patch: Partial<Review>) =>
    setRecoveryReviews((all) => ({ ...all, [id]: { ...all[id], ...patch } }));
  const compile = async (latex: string) => {
    if (!window.resumeDesktop)
      throw new Error(
        "LaTeX compilation is available in the installed desktop app.",
      );
    const response = await window.resumeDesktop.compileLatex(latex);
    setCompileLog(response.log);
    if (!response.ok || !response.pdf)
      throw new Error(
        response.error || "LaTeX compilation failed. See the compiler log.",
      );
    const pageCount = response.pageCount ?? await getPdfPageCount(response.pdf);
    return { pdf: response.pdf, pageCount };
  };
  const downloadBackup = () => {
    const content = initial.error ? localStorage.getItem(SESSION_KEY) ?? "" : JSON.stringify({ version: 1, session, history }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "resume-toner-private-backup.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restoreBackupFile = (file: File) => void guard(async () => {
    if (file.size > 20_000_000) throw new Error("Backup exceeds 20 MB.");
    const archive = ArchiveSchema.parse(JSON.parse(await file.text()));
    if (!window.confirm("Restore this backup? Your current session will be kept as a history snapshot.")) return;
    const nextHistory = addSnapshot(archive.history, session, "Before backup restore");
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...archive, history: nextHistory }));
    window.location.reload();
  });
  const settingsButton = (
    <button className="icon-button secondary" onClick={() => setSettingsOpen(true)} aria-label="Open settings" title="Settings">
      <span aria-hidden="true">⚙</span><span>Settings</span>
    </button>
  );

  const settingsPage = (
      <main className="shell desktop-shell settings-page">
        <header className="settings-header">
          <button className="secondary back-button" onClick={() => setSettingsOpen(false)}>← Back to workspace</button>
          <div>
            <p className="eyebrow">RESUME TONER</p>
            <h1>Settings</h1>
            <p className="muted">Manage exports, private backups, and earlier resume versions.</p>
          </div>
          <span className={`save-status ${storageError ? "needs-attention" : ""}`}>
            <span aria-hidden="true">{storageError ? "!" : "✓"}</span>
            {storageError ? "Autosave needs attention" : "Autosaved on this device"}
          </span>
        </header>
        {storageError && <p className="error" role="alert">{storageError}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings sections">
            <a href="#general">General</a>
            <a href="#backup">Backup & restore</a>
            <a href="#versions">Version history <span>{history.length}/5</span></a>
          </nav>
          <div className="settings-content">
            <section className="settings-card" id="general">
              <div className="settings-card-heading"><div><p className="eyebrow">GENERAL</p><h2>Export preferences</h2></div></div>
              <label className="settings-field">
                Default PDF filename
                <span>The name used when you export a tailored resume.</span>
                <input value={resumeFilename} onChange={(event) => setResumeFilename(event.target.value)} onBlur={() => void guard(async () => {
                  const saved = await window.resumeDesktop?.setResumeFilename(resumeFilename);
                  if (saved) setResumeFilename(saved);
                })} />
              </label>
              <div className="setting-row">
                <div><strong>Saved base resume</strong><p>{savedBase ? "A base LaTeX resume is saved on this device." : "No base resume has been saved yet."}</p></div>
                <button className="secondary" disabled={!savedBase} onClick={() => void guard(async () => { await window.resumeDesktop?.saveLatex(savedBase); })}>Export base .tex</button>
              </div>
            </section>
            <section className="settings-card" id="backup">
              <div className="settings-card-heading"><div><p className="eyebrow">PORTABLE COPY</p><h2>Backup & restore</h2></div><span className="private-badge">Private · local only</span></div>
              <p className="muted">A backup includes your resume, job text, review decisions, and version history. Store it somewhere private.</p>
              <div className="backup-actions">
                <button onClick={downloadBackup}>Download backup</button>
                <label className="button secondary file-button">Restore from backup<input type="file" accept=".json" onChange={(event) => {
                  const file = event.target.files?.[0]; event.target.value = "";
                  if (file) restoreBackupFile(file);
                }} /></label>
              </div>
              <p className="settings-note">Restoring replaces the active workspace. A snapshot of your current work is created first.</p>
            </section>
            <section className="settings-card" id="versions">
              <div className="settings-card-heading">
                <div><p className="eyebrow">LOCAL HISTORY</p><h2>Resume versions</h2><p className="muted">The five newest snapshots are kept automatically.</p></div>
                <button onClick={() => checkpoint("Manual snapshot")}>Save current version</button>
              </div>
              {!history.length && <div className="version-empty"><strong>No earlier versions yet</strong><p>Save a version now, or start a new job to create one automatically.</p></div>}
              <div className="version-list">
                {history.map((item, index) => <article className="version-card" key={item.id}>
                  <div className="version-index" aria-hidden="true">{index + 1}</div>
                  <div className="version-info"><div><strong>{item.label}</strong>{index === 0 && <span className="latest-badge">Newest</span>}</div><time dateTime={item.date}>{new Date(item.date).toLocaleString()}</time><p>{item.session.result ? `${item.session.result.company} · ${item.session.result.role}` : item.session.job ? "Job tailoring in progress" : "Base resume workspace"}</p></div>
                  <div className="version-actions">
                    <button className="secondary" onClick={() => {
                      if (!window.confirm("Restore this version? Your current work will be kept in history.")) return;
                      checkpoint("Before history restore"); restore(item.session); setSettingsOpen(false);
                    }}>Restore</button>
                    <button className="danger-link" onClick={() => {
                      if (window.confirm("Delete this saved version? This cannot be undone.")) setHistory((all) => all.filter((entry) => entry.id !== item.id));
                    }}>Delete</button>
                  </div>
                </article>)}
              </div>
            </section>
          </div>
        </div>
      </main>
    );

  useEffect(() => {
    if (!current || !window.resumeDesktop) return;
    let active = true,
      url = "";
    const timer = window.setTimeout(
      () =>
        void compile(current)
          .then(async ({ pdf, pageCount }) => {
            if (!active) return;
            let effectiveTarget = targetPageCount;
            if (effectiveTarget === null) {
              if (current === base) effectiveTarget = pageCount;
              else effectiveTarget = (await compile(base)).pageCount;
              if (!active) return;
              setTargetPageCount(effectiveTarget);
            }
            setCurrentPageCount(pageCount);
            url = URL.createObjectURL(
              new Blob([pdf], { type: "application/pdf" }),
            );
            setPreview(url);
            setShortTailWords(new Map());
            setLineAnalysisMessage("");
            if (result && pageCount > effectiveTarget) {
              try {
                const lines = await extractRenderedLines(pdf);
                if (!active) return;
                const analysis = findShortTailRecoveries(lines, result.spaceRecovery);
                setShortTailWords(analysis.tailWords);
                const tightenCount = result.spaceRecovery.filter((item) => item.strategy === "tighten").length;
                if (tightenCount > 0 && analysis.matchedTargets === 0)
                  setLineAnalysisMessage("No short wrapped bullets could be matched automatically. Removal options are still available.");
                else if (analysis.tailWords.size === 0)
                  setLineAnalysisMessage("No one- or two-word bullet tails were detected. Removal options are still available.");
              } catch {
                if (active) setLineAnalysisMessage("Short wrapped bullets could not be analyzed automatically. Removal options are still available.");
              }
            }
          })
          .catch((e) => {
            if (active) setError(e instanceof Error ? e.message : String(e));
          }),
      350,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [base, current, result, targetPageCount]);

  if (settingsOpen) return settingsPage;

  if (!base)
    return (
      <main className="shell desktop-setup">
        <header className="topbar">
          <div>
            <p className="eyebrow">{desktopPlatform.osLabel} · LOCAL LATEX</p>
            <h1>Resume Toner Desktop</h1>
          </div>
          <div className="top-actions">{settingsButton}</div>
        </header>
        <section className="panel empty-state setup-card">
          <h2>Add your base LaTeX resume</h2>
          <p>
            Open a complete `.tex` file or paste its source. The app compiles it
            locally with {desktopPlatform.latexDistribution}.
          </p>
          <textarea
            className="prompt latex-source"
            value={latexInput}
            onChange={(e) => setLatexInput(e.target.value)}
            placeholder="\\documentclass…"
          />
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button
              className="secondary"
              onClick={() =>
                void guard(async () => {
                  if (!window.resumeDesktop) return;
                  const loaded = await window.resumeDesktop.openLatex();
                  if (loaded) setLatexInput(loaded);
                })
              }
            >
              Open .tex file
            </button>
            <button
              disabled={!latexInput.trim()}
              onClick={() =>
                void guard(async () => {
                  const valid = validateLatexSource(latexInput);
                  await compile(valid);
                  saveBase(valid);
                })
              }
            >
              Compile and save base
            </button>
          </div>
          {compileLog && (
            <details>
              <summary>Compiler log</summary>
              <pre className="compile-log">{compileLog}</pre>
            </details>
          )}
        </section>
      </main>
    );

  const prompt = job.trim().length >= 50 ? buildChatPrompt(base, job) : "";
  const unresolved = Object.values(reviews).some(
    (x) => x.decision === "pending",
  );
  const resolved = Object.values(reviews).filter(
    (x) => x.decision !== "pending",
  ).length;
  const overflow =
    targetPageCount !== null &&
    currentPageCount !== null &&
    currentPageCount > targetPageCount;
  const visibleRecoveries = result
    ? selectVisibleRecoveries(overflow, currentBeforeRecovery, result.spaceRecovery, recoveryReviews, shortTailWords)
    : [];

  return (
    <main className="shell desktop-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CHATGPT-ASSISTED · LOCAL LATEX</p>
          <h1>Resume Toner Desktop</h1>
        </div>
        <div className="top-actions">
          <span className="cloud-badge">{desktopPlatform.latexDistribution} · no API key</span>
          <button className="secondary" onClick={() => setSideOpen((x) => !x)}>
            {sideOpen ? "Hide" : "Show"} analysis
          </button>
          <button
            className="secondary"
            onClick={() => {
              if (!window.confirm("Replace the base resume? Your current session will be kept in local history.")) return;
              checkpoint("Before replacing base");
              restore(emptySession());
            }}
          >
            Replace base .tex
          </button>
          {settingsButton}
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="success">{notice}</p>}
      {!result ? (
        <div className="desktop-flow">
          <section className="panel">
            <p className="eyebrow">STEP 1</p>
            <h2>Paste the job posting</h2>
            <textarea
              rows={18}
              value={job}
              onChange={(e) => setJob(e.target.value)}
              placeholder="Paste the complete posting…"
            />
          </section>
          <section className="panel">
            <p className="eyebrow">STEP 2</p>
            <h2>Use your ChatGPT window</h2>
            <p className="muted">
              The prompt contains your LaTeX source and asks for exact,
              reviewable replacements.
            </p>
            <textarea className="prompt" readOnly value={prompt} />
            <div className="actions">
              <button
                disabled={!prompt}
                onClick={() =>
                  void guard(async () => {
                    await navigator.clipboard.writeText(prompt);
                    setNotice("Prompt copied. Paste it into ChatGPT.");
                  })
                }
              >
                Copy prompt
              </button>
              <button
                className="secondary"
                onClick={() => void window.resumeDesktop?.openChatGPT()}
              >
                Open ChatGPT
              </button>
            </div>
          </section>
          <section className="panel response-panel">
            <p className="eyebrow">STEP 3</p>
            <h2>Paste ChatGPT’s JSON</h2>
            <textarea
              className="prompt"
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Paste the complete JSON response…"
            />
            <button
              disabled={!responseText.trim()}
              onClick={() =>
                void guard(() => {
                  const parsed = validateResponseTargets(
                    parseTailoringResponse(responseText),
                    base,
                  );
                  setResult(parsed);
                  setReviews(
                    Object.fromEntries(
                      parsed.proposals.map((p) => [
                        p.id,
                        {
                          decision: "pending",
                          text: p.proposedLatex,
                          scope: "current",
                          syntheticVerified: false,
                        },
                      ]),
                    ),
                  );
                  setRecoveryReviews(
                    Object.fromEntries(
                      parsed.spaceRecovery.map((p) => [
                        p.id,
                        {
                          decision: "pending",
                          text: p.proposedLatex,
                          scope: "current",
                          syntheticVerified: false,
                        },
                      ]),
                    ),
                  );
                })
              }
            >
              Review resume changes
            </button>
          </section>
        </div>
      ) : (
        <div className={`desktop-review ${sideOpen ? "with-analysis" : ""}`}>
          {sideOpen && (
            <aside className="analysis-panel panel">
              <p className="eyebrow">ROLE ANALYSIS</p>
              <h2>
                {result.company} · {result.role}
              </h2>
              <div className={`eligibility ${result.eligibility.status}`}>
                <strong>
                  {result.eligibility.status.replaceAll("_", " ")}
                </strong>
                <p>{result.eligibility.summary}</p>
                {result.eligibility.blockers.map((x) => (
                  <div key={x}>• {x}</div>
                ))}
              </div>
              <h3>Target profile</h3>
              <p>{result.targetProfile}</p>
              <h3>Biggest gaps</h3>
              <ul>
                {result.biggestGaps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <h3>Research</h3>
              {result.researchNotes.map((x, i) => (
                <p key={i}>
                  {x.finding}{" "}
                  {x.sourceUrl && (
                    <a href={x.sourceUrl}>{x.sourceTitle || "Source"}</a>
                  )}
                </p>
              ))}
            </aside>
          )}
          <section className="changes-column">
            <nav className="run-nav">
              <button
                className="secondary"
                onClick={() => {
                  checkpoint(result.company + " · " + result.role);
                  setBase(savedBase);
                  setResult(null);
                  setReviews({});
                  setRecoveryReviews({});
                  setJob("");
                  setResponseText("");
                  setPreview("");
                }}
              >
                ← New job
              </button>
              <span>
                {resolved}/{result.proposals.length} reviewed
              </span>
            </nav>
            <KeywordCoverage result={result} reviews={reviews} />
            {overflow && (
              <section className="overflow-recovery" aria-labelledby="overflow-recovery-title">
                <div className="overflow-heading">
                  <div>
                    <p className="eyebrow">PAGE OVERFLOW</p>
                    <h2 id="overflow-recovery-title">Fit résumé to page limit</h2>
                  </div>
                  <strong>{currentPageCount} / {targetPageCount} pages</strong>
                </div>
                <p>
                  Review optional space-saving edits. Confirmed short-line fixes are shown first; other safe reductions remain available below them.
                </p>
                {lineAnalysisMessage && <p className="muted">{lineAnalysisMessage}</p>}
                {visibleRecoveries.length === 0 && (
                  <p className="recovery-empty">No applicable recovery suggestions were returned. Edit a proposal or the LaTeX source to reduce the page count.</p>
                )}
                {visibleRecoveries.map((recovery) => {
                  const review = recoveryReviews[recovery.id];
                  const tail = shortTailWords.get(recovery.id);
                  return (
                    <article className={`proposal recovery-card ${review.decision}`} key={recovery.id}>
                      <div className="proposal-top">
                        <span>{recovery.strategy === "remove" ? "REMOVE" : "TIGHTEN"} · {recovery.title}</span>
                        <mark>{tail ? `${tail}-word final line` : recovery.strategy === "remove" ? "suggested removal" : "suggested tightening"}</mark>
                      </div>
                      <ResumeComparison
                        before={recovery.currentLatex}
                        after={review.text}
                        disabled={review.decision === "rejected"}
                        onAfterChange={(wording) =>
                          setRecoveryReview(recovery.id, {
                            text: editReadableLatex(review.text || recovery.currentLatex, wording),
                            decision: "pending",
                          })
                        }
                      />
                      <small>{recovery.why}</small>
                      <details className="source-editor">
                        <summary>View / edit LaTeX source</summary>
                        <label>Current LaTeX</label>
                        <pre className="latex-diff old">{recovery.currentLatex}</pre>
                        <label>Proposed LaTeX</label>
                        <textarea
                          className="latex-edit"
                          value={review.text}
                          onChange={(event) => setRecoveryReview(recovery.id, { text: event.target.value, decision: "pending" })}
                        />
                      </details>
                      <div className="actions">
                        <button onClick={() => setRecoveryReview(recovery.id, { decision: "accepted" })}>Accept</button>
                        <button className="secondary" onClick={() => setRecoveryReview(recovery.id, { decision: "rejected" })}>Reject</button>
                        <button className="link-button" onClick={() => setRecoveryReview(recovery.id, { decision: "pending", text: recovery.proposedLatex })}>Reset</button>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
            {result.proposals.map((p, index) => {
              const review = reviews[p.id];
              return (
                <article
                  className={`proposal ${review.decision} ${p.factuality === "synthetic" ? "synthetic" : ""}`}
                  key={p.id}
                >
                  <div className="proposal-top">
                    <span>
                      CHANGE {index + 1} · {p.title}
                    </span>
                    <mark>{p.factuality}</mark>
                  </div>
                  <ResumeComparison
                    before={p.currentLatex}
                    after={review.text}
                    disabled={review.decision === "rejected"}
                    onAfterChange={(wording) =>
                      setReview(p.id, {
                        text: editReadableLatex(review.text, wording),
                        decision: "pending",
                      })
                    }
                  />
                  <details className="source-editor">
                    <summary>View / edit LaTeX source</summary>
                    <p className="muted">Text preview above; the compiled PDF shows exact formatting.</p>
                  <label>Current LaTeX</label>
                  <pre className="latex-diff old">{p.currentLatex}</pre>
                  <label>Proposed LaTeX</label>
                  <textarea
                    className="latex-edit"
                    value={review.text}
                    onChange={(e) =>
                      setReview(p.id, {
                        text: e.target.value,
                        decision: "pending",
                      })
                    }
                  />
                  </details>
                  <small>{p.why}</small>
                  <div className="recommendation">{p.recommendation}</div>
                  <div className="scope-switch">
                    <span>Apply to</span>
                    <button
                      className={review.scope === "current" ? "" : "secondary"}
                      onClick={() => setReview(p.id, { scope: "current" })}
                    >
                      This job only
                    </button>
                    <button
                      className={review.scope === "base" ? "" : "secondary"}
                      onClick={() => setReview(p.id, { scope: "base" })}
                    >
                      This job + saved base
                    </button>
                  </div>
                  <p className="muted">{review.scope === "base" ? "After acceptance, this also updates the saved base when you successfully export the PDF." : "After acceptance, this changes only this job’s resume. Your saved base stays unchanged."}</p>
                  {p.factuality === "synthetic" && (
                    <label className="synthetic-check">
                      <input
                        type="checkbox"
                        checked={review.syntheticVerified}
                        onChange={(e) =>
                          setReview(p.id, {
                            syntheticVerified: e.target.checked,
                            decision: "pending",
                          })
                        }
                      />{" "}
                      I confirm this claim is true and I can defend it in an
                      interview.
                    </label>
                  )}
                  <div className="actions">
                    <button
                      disabled={
                        p.factuality === "synthetic" &&
                        !review.syntheticVerified
                      }
                      onClick={() => setReview(p.id, { decision: "accepted" })}
                    >
                      Accept
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setReview(p.id, { decision: "rejected" })}
                    >
                      Reject
                    </button>
                    <button
                      className="link-button"
                      onClick={() =>
                        setReview(p.id, {
                          decision: "pending",
                          text: p.proposedLatex,
                        })
                      }
                    >
                      Reset
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
          <section className="preview-panel">
            <p className="eyebrow">COMPILED LATEX</p>
            <h2>Current resume</h2>
            {targetPageCount !== null && currentPageCount !== null && (
              <p className={`page-fit ${overflow ? "overflow" : "fits"}`} role="status">
                {overflow ? "Overflow" : "Fits"}: {currentPageCount} / {targetPageCount} {targetPageCount === 1 ? "page" : "pages"}
              </p>
            )}
            {preview ? (
              <iframe title="Compiled LaTeX PDF" src={preview} />
            ) : (
              <div className="preview-empty">Compiling with {desktopPlatform.latexDistribution}…</div>
            )}
            <button
              disabled={busy || unresolved}
              onClick={() =>
                void guard(async () => {
                  const { pdf } = await compile(current);
                  if (!window.resumeDesktop) return;
                  const path = await window.resumeDesktop.saveResume(
                    pdf,
                    resumeFilename,
                  );
                  if (path) {
                    checkpoint(result.company + " · " + result.role + " (exported)");
                    setSavedBase(baseAfterReview);
                  }
                  setNotice(path ? `Saved ${path}` : "Save cancelled.");
                })
              }
            >
              Download resume PDF
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void guard(async () => {
                  if (!window.resumeDesktop) return;
                  const path = await window.resumeDesktop.saveLatex(current);
                  setNotice(path ? `Saved ${path}` : "Save cancelled.");
                })
              }
            >
              Save resume LaTeX
            </button>
            {compileLog && (
              <details>
                <summary>Compiler log</summary>
                <pre className="compile-log">{compileLog}</pre>
              </details>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
