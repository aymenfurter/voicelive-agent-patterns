import { useMemo } from 'react';
import type { SemanticEvent } from '../types';

interface Props {
  events: SemanticEvent[];
  isActive: boolean;
}

const AGENTS = [
  { id: 'greeter', label: 'Greeter', iconId: 'greeter', desc: 'Welcome & route' },
  { id: 'top_level_qa', label: 'Top-Level QA', iconId: 'question', desc: 'Determine claim type' },
  { id: 'auto_claims', label: 'Auto Claims', iconId: 'car', desc: 'Vehicle incidents' },
  { id: 'property_claims', label: 'Property Claims', iconId: 'house', desc: 'Home & property' },
  { id: 'health_claims', label: 'Health Claims', iconId: 'health', desc: 'Medical bills' },
  { id: 'summary', label: 'Summary', iconId: 'clipboard', desc: 'Review & submit' },
];

const CLAIM_IDS = ['auto_claims', 'property_claims', 'health_claims'];

export function SequentialHandoffDiagram({ events, isActive }: Props) {
  const { activeAgent, visitedAgents, phase, handoffHistory } = useMemo(() => {
    let active = isActive ? 'greeter' : '';
    const visited = new Set<string>();
    const handoffs: Array<{ from: string; to: string }> = [];
    let ph = isActive ? 'Greeting caller…' : 'Idle';

    for (const e of events) {
      if (e.type === 'agent.handoff') {
        const from = (e.details?.from as string) || '';
        const to = (e.details?.to as string) || '';
        if (from && to) {
          visited.add(from);
          active = to;
          handoffs.push({ from, to });
          const info = AGENTS.find((a) => a.id === active);
          ph = info ? `${info.label} active` : `Agent: ${active}`;
        }
      } else if (e.type === 'tool.called') {
        const tool = e.description.replace('tool.called: ', '');
        ph = `Calling ${tool}…`;
      } else if (e.type === 'audio.started') {
        ph = 'User speaking';
      } else if (e.type === 'response.created') {
        const info = AGENTS.find((a) => a.id === active);
        ph = info ? `${info.label} thinking…` : 'Thinking…';
      } else if (e.type === 'response.done') {
        const info = AGENTS.find((a) => a.id === active);
        ph = info ? `${info.label} responded` : 'Responded';
      }
    }
    if (active) visited.add(active);
    return { activeAgent: active, visitedAgents: visited, phase: ph, handoffHistory: handoffs };
  }, [events, isActive]);

  const activeClaimAgent = CLAIM_IDS.find((a) => activeAgent === a || visitedAgents.has(a));

  // Layout positions
  const greeter  = { x: 80,  y: 50 };
  const topQA    = { x: 250, y: 50 };
  const auto     = { x: 80,  y: 155 };
  const property = { x: 240, y: 155 };
  const health   = { x: 400, y: 155 };
  const summary  = { x: 240, y: 260 };

  const isEdgeActive = (to: string) => visitedAgents.has(to) || activeAgent === to;
  const isEdgeDim = (to: string) => !visitedAgents.has(to) && activeAgent !== to;

  return (
    <div className="orch-diagram">
      <div className="orch-title">Sequential Handoff Pattern</div>
      <div className="orch-phase">{phase}</div>

      <svg viewBox="0 0 500 330" className="orch-svg">
        <defs>
          <marker id="shArrowGold" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0,0 8,3 0,6" fill="var(--gold)" />
          </marker>
          <marker id="shArrowDim" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0,0 8,3 0,6" fill="var(--border)" />
          </marker>
        </defs>

        {/* Greeter → Top-Level QA */}
        <line x1={greeter.x + 50} y1={greeter.y + 25} x2={topQA.x - 55} y2={topQA.y + 25}
          className={`orch-edge${isEdgeActive('top_level_qa') ? ' edge-active' : ''}`}
          markerEnd={isEdgeActive('top_level_qa') ? 'url(#shArrowGold)' : 'url(#shArrowDim)'} />

        {/* Top-Level QA → Auto Claims */}
        <line x1={topQA.x - 10} y1={topQA.y + 50} x2={auto.x + 20} y2={auto.y}
          className={`orch-edge${isEdgeActive('auto_claims') ? ' edge-active' : ''}${isEdgeDim('auto_claims') ? ' edge-dashed' : ''}`}
          markerEnd={isEdgeActive('auto_claims') ? 'url(#shArrowGold)' : 'url(#shArrowDim)'} />

        {/* Top-Level QA → Property Claims */}
        <line x1={topQA.x} y1={topQA.y + 50} x2={property.x} y2={property.y}
          className={`orch-edge${isEdgeActive('property_claims') ? ' edge-active' : ''}${isEdgeDim('property_claims') ? ' edge-dashed' : ''}`}
          markerEnd={isEdgeActive('property_claims') ? 'url(#shArrowGold)' : 'url(#shArrowDim)'} />

        {/* Top-Level QA → Health Claims */}
        <line x1={topQA.x + 10} y1={topQA.y + 50} x2={health.x - 20} y2={health.y}
          className={`orch-edge${isEdgeActive('health_claims') ? ' edge-active' : ''}${isEdgeDim('health_claims') ? ' edge-dashed' : ''}`}
          markerEnd={isEdgeActive('health_claims') ? 'url(#shArrowGold)' : 'url(#shArrowDim)'} />

        {/* Claim → Summary */}
        {CLAIM_IDS.map((cid) => {
          const pos = cid === 'auto_claims' ? auto : cid === 'property_claims' ? property : health;
          const show = activeClaimAgent === cid || visitedAgents.has(cid);
          const toSummary = isEdgeActive('summary');
          if (!show && !activeClaimAgent) {
            // Show faint center line when nothing selected
            return cid === 'property_claims' ? (
              <line key={cid} x1={property.x} y1={property.y + 50} x2={summary.x} y2={summary.y}
                className="orch-edge edge-dashed"
                markerEnd="url(#shArrowDim)" />
            ) : null;
          }
          if (!show) return null;
          return (
            <line key={cid}
              x1={pos.x} y1={pos.y + 50}
              x2={summary.x} y2={summary.y}
              className={`orch-edge${toSummary ? ' edge-active' : ''}`}
              markerEnd={toSummary ? 'url(#shArrowGold)' : 'url(#shArrowDim)'} />
          );
        })}

        {/* Nodes */}
        <AgentNode x={greeter.x} y={greeter.y} agent={AGENTS[0]}
          isActive={activeAgent === 'greeter'} isVisited={visitedAgents.has('greeter')} />
        <AgentNode x={topQA.x} y={topQA.y} agent={AGENTS[1]}
          isActive={activeAgent === 'top_level_qa'} isVisited={visitedAgents.has('top_level_qa')} />

        <AgentNode x={auto.x} y={auto.y} agent={AGENTS[2]}
          isActive={activeAgent === 'auto_claims'} isVisited={visitedAgents.has('auto_claims')} />
        <AgentNode x={property.x} y={property.y} agent={AGENTS[3]}
          isActive={activeAgent === 'property_claims'} isVisited={visitedAgents.has('property_claims')} />
        <AgentNode x={health.x} y={health.y} agent={AGENTS[4]}
          isActive={activeAgent === 'health_claims'} isVisited={visitedAgents.has('health_claims')} />

        <AgentNode x={summary.x} y={summary.y} agent={AGENTS[5]}
          isActive={activeAgent === 'summary'} isVisited={visitedAgents.has('summary')} />
      </svg>

      {handoffHistory.length > 0 && (
        <div className="handoff-timeline">
          <span className="timeline-label">Handoffs:</span>
          {handoffHistory.map((h, i) => (
            <span key={i} className="handoff-step">
              <span className="handoff-from">{AGENTS.find(a => a.id === h.from)?.label ?? '?'}</span>
              <span className="handoff-arrow">{'\u2192'}</span>
              <span className="handoff-to">{AGENTS.find(a => a.id === h.to)?.label ?? '?'}</span>
              {i < handoffHistory.length - 1 && <span className="handoff-sep">{'\u00B7'}</span>}
            </span>
          ))}
        </div>
      )}

      <div className="orch-legend">
        <span className="legend-item"><span className="legend-dot dot-active" />Active</span>
        <span className="legend-item"><span className="legend-dot dot-visited" />Visited</span>
        <span className="legend-item"><span className="legend-dot dot-pending" />Pending</span>
      </div>
    </div>
  );
}

function SvgIcon({ id, size = 14 }: { id: string; size?: number }) {
  const s = size;
  const icons: Record<string, JSX.Element> = {
    greeter: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    question: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    car: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-3h8l2 3h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2" />
        <circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" />
      </svg>
    ),
    house: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    health: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    clipboard: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      </svg>
    ),
  };
  return icons[id] ?? null;
}

function AgentNode({ x, y, agent, isActive, isVisited }: {
  x: number; y: number;
  agent: { id: string; label: string; iconId: string; desc: string };
  isActive: boolean; isVisited: boolean;
}) {
  const cls = isActive ? 'node-active node-pulse' : isVisited ? 'node-visited' : 'node-pending';
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x="-50" y="0" width="100" height="50" rx="10"
        className={`orch-node-rect ${cls}`} />
      <foreignObject x="-7" y="2" width="14" height="14">
        <div style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SvgIcon id={agent.iconId} size={12} />
        </div>
      </foreignObject>
      <text x="0" y="30" className="orch-node-text-top">{agent.label}</text>
      <text x="0" y="44" className="orch-node-text-sub">{agent.desc}</text>
    </g>
  );
}
