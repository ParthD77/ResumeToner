import type { TailoringResponse } from "./contract";
import { groupKeywordCoverage, type MissingKeyword } from "./keyword-coverage";
import type { Review } from "./session";

function MissingList({ items, empty }: { items: MissingKeyword[]; empty: string }) {
  if (items.length === 0) return <p className="keyword-empty">{empty}</p>;
  return (
    <ul className="keyword-list">
      {items.map((item) => (
        <li key={item.keyword}>
          <span>{item.keyword}</span>
          <small className={`keyword-importance ${item.importance}`}>{item.importance}</small>
        </li>
      ))}
    </ul>
  );
}

export function KeywordCoverage({ result, reviews }: { result: TailoringResponse; reviews: Record<string, Review> }) {
  const groups = groupKeywordCoverage(result, reviews);
  const tracked = groups.covered.length + result.keywordAnalysis.missing.length;
  const projected = groups.covered.length + groups.added.length;
  const percent = tracked === 0 ? 0 : Math.round((projected / tracked) * 100);

  return (
    <section className="keyword-coverage" aria-labelledby="keyword-coverage-title">
      <div className="keyword-heading">
        <div>
          <p className="eyebrow">KEYWORD COVERAGE</p>
          <h3 id="keyword-coverage-title">What your resume covers</h3>
        </div>
        <div className="keyword-score" aria-label={`${percent}% projected keyword coverage`}>
          <strong>{percent}%</strong>
          <span>after accepted changes</span>
        </div>
      </div>
      {tracked === 0 ? (
        <p className="keyword-empty">No structured keyword analysis was included in this saved result. Run a new job analysis to see coverage tracking.</p>
      ) : (
        <>
          <div className="keyword-meter" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
          <div className="keyword-groups">
            <section className="keyword-group good">
              <h4><span>✓</span> Already strong <small>{groups.covered.length}</small></h4>
              {groups.covered.length ? <ul className="keyword-list">{groups.covered.map((item) => <li key={item.keyword} title={item.evidence}><span>{item.keyword}</span></li>)}</ul> : <p className="keyword-empty">No confirmed matches yet.</p>}
            </section>
            <section className="keyword-group added">
              <h4><span>+</span> Added by accepted changes <small>{groups.added.length}</small></h4>
              <MissingList items={groups.added} empty="Accept a suggestion to add coverage." />
            </section>
            <section className="keyword-group suggested">
              <h4><span>→</span> Covered by suggestions <small>{groups.suggested.length}</small></h4>
              <MissingList items={groups.suggested} empty="No pending suggestions add keywords." />
            </section>
            <section className="keyword-group missing">
              <h4><span>!</span> Still missing <small>{groups.remaining.length}</small></h4>
              <MissingList items={groups.remaining} empty="Nothing remains uncovered." />
            </section>
          </div>
          <p className="keyword-footnote">Coverage updates as you accept or reject changes. Hover an existing keyword to see its resume evidence.</p>
        </>
      )}
    </section>
  );
}
