/** Recursive JSON tree renderer for event detail inspection. */
export function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return <span className="json-null">null</span>;
  if (typeof data === 'string') {
    const truncated = data.length > 120 ? data.slice(0, 120) + '…' : data;
    return <span className="json-string">&quot;{truncated}&quot;</span>;
  }
  if (typeof data === 'number') return <span className="json-number">{data}</span>;
  if (typeof data === 'boolean') return <span className="json-bool">{data ? 'true' : 'false'}</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="json-bracket">[]</span>;
    if (depth > 2) return <span className="json-bracket">[…{data.length}]</span>;
    return (
      <span>
        <span className="json-bracket">[</span>
        <div className="json-indent">
          {data.map((item, i) => (
            <div key={i}>
              <JsonTree data={item} depth={depth + 1} />
              {i < data.length - 1 && <span className="json-comma">,</span>}
            </div>
          ))}
        </div>
        <span className="json-bracket">]</span>
      </span>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="json-bracket">{'{}'}</span>;
    const filtered = entries.filter(
      ([k, v]) =>
        !(depth === 0 && k === 'type') &&
        !(k === 'audio' && typeof v === 'string' && (v as string).length > 200),
    );
    if (filtered.length === 0) return <span className="json-bracket">{'{}'}</span>;
    if (depth > 2) return <span className="json-bracket">{'{'} …{filtered.length} {'}'}</span>;
    return (
      <span>
        <span className="json-bracket">{'{'}</span>
        <div className="json-indent">
          {filtered.map(([k, v], i) => (
            <div key={k}>
              <span className="json-key">{k}</span>
              <span className="json-colon">: </span>
              <JsonTree data={v} depth={depth + 1} />
              {i < filtered.length - 1 && <span className="json-comma">,</span>}
            </div>
          ))}
        </div>
        <span className="json-bracket">{'}'}</span>
      </span>
    );
  }

  return <span>{String(data)}</span>;
}
