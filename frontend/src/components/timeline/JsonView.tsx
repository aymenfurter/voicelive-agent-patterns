import { useState } from 'react';

/** Recursive collapsible JSON viewer used by the timeline detail panel. */
export function JsonView({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (data === null || data === undefined) return <span className="fst-null">null</span>;

  if (typeof data === 'string') {
    if (data.length > 200) {
      return <span className="fst-string" title={data}>&quot;{data.slice(0, 200)}…&quot;</span>;
    }
    return <span className="fst-string">&quot;{data}&quot;</span>;
  }
  if (typeof data === 'number') return <span className="fst-number">{data}</span>;
  if (typeof data === 'boolean') return <span className="fst-bool">{String(data)}</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="fst-bracket">[]</span>;
    return (
      <span>
        <span className="fst-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? '▼' : '▶'} [{data.length}]
        </span>
        {expanded && (
          <div className="fst-indent">
            {data.map((item, i) => (
              <div key={i}><JsonView data={item} depth={depth + 1} /></div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([k, v]) => !(k === 'audio' && typeof v === 'string' && (v as string).length > 100),
    );
    if (entries.length === 0) return <span className="fst-bracket">{'{}'}</span>;
    return (
      <span>
        <span className="fst-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? '▼' : '▶'} {'{'}…{entries.length}{'}'}
        </span>
        {expanded && (
          <div className="fst-indent">
            {entries.map(([k, v]) => (
              <div key={k}>
                <span className="fst-key">{k}</span>: <JsonView data={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}
