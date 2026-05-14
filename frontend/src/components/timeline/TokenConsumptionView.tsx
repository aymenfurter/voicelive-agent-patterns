import { useMemo } from 'react';
import type { SemanticEvent } from '../../types';
import { estimateCost, formatCost } from '../../utils/costEstimator';
import { formatDelta } from '../../utils/timelineSpans';
import { TokenSparkline, type TokenPoint } from './TokenSparkline';

interface Props {
  events: SemanticEvent[];
  model?: string;
}

function buildTokenPoints(events: SemanticEvent[]): TokenPoint[] {
  const responseDoneEvents = events.filter(
    (e) => e.type === 'response.done' && e.details && (e.details as Record<string, unknown>).usage,
  );

  let cumInput = 0, cumOutput = 0, cumTotal = 0;
  return responseDoneEvents.map((e, i) => {
    const usage = ((e.details as Record<string, unknown>).usage as Record<string, number>) ?? {};
    const inp = usage.input_tokens ?? 0;
    const out = usage.output_tokens ?? 0;
    const tot = usage.total_tokens ?? inp + out;
    cumInput += inp;
    cumOutput += out;
    cumTotal += tot;
    return {
      timestamp: e.timestamp,
      inputTokens: inp,
      outputTokens: out,
      totalTokens: tot,
      cumulativeInput: cumInput,
      cumulativeOutput: cumOutput,
      cumulativeTotal: cumTotal,
      responseIndex: i,
    };
  });
}

export function TokenConsumptionView({ events, model }: Props) {
  const sessionStart = events.length > 0 ? events[0].timestamp : Date.now();
  const tokenPoints = useMemo(() => buildTokenPoints(events), [events]);

  const lastPoint = tokenPoints[tokenPoints.length - 1];
  const totalInput = lastPoint?.cumulativeInput ?? 0;
  const totalOutput = lastPoint?.cumulativeOutput ?? 0;
  const totalAll = lastPoint?.cumulativeTotal ?? 0;

  const estimatedCost = totalAll > 0
    ? estimateCost({ inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalAll }, model)
    : 0;

  const avgInputPerTurn = tokenPoints.length > 0 ? Math.round(totalInput / tokenPoints.length) : 0;
  const avgOutputPerTurn = tokenPoints.length > 0 ? Math.round(totalOutput / tokenPoints.length) : 0;

  return (
    <div className="fst-tokens">
      <div className="fst-tokens__cards">
        <div className="fst-tokens__card">
          <span className="fst-tokens__card-label">Total Tokens</span>
          <span className="fst-tokens__card-value">{totalAll.toLocaleString()}</span>
          <span className="fst-tokens__card-sub">{tokenPoints.length} responses</span>
        </div>
        <div className="fst-tokens__card">
          <span className="fst-tokens__card-label">Input Tokens</span>
          <span className="fst-tokens__card-value" style={{ color: '#6BAFFF' }}>{totalInput.toLocaleString()}</span>
          <span className="fst-tokens__card-sub">~{avgInputPerTurn.toLocaleString()} / turn</span>
        </div>
        <div className="fst-tokens__card">
          <span className="fst-tokens__card-label">Output Tokens</span>
          <span className="fst-tokens__card-value" style={{ color: '#47D05A' }}>{totalOutput.toLocaleString()}</span>
          <span className="fst-tokens__card-sub">~{avgOutputPerTurn.toLocaleString()} / turn</span>
        </div>
        <div className="fst-tokens__card">
          <span className="fst-tokens__card-label">Est. Cost</span>
          <span className="fst-tokens__card-value" style={{ color: '#E5A922' }}>
            {totalAll > 0 ? formatCost(estimatedCost) : '—'}
          </span>
          <span className="fst-tokens__card-sub">{model ?? 'default model'}</span>
        </div>
      </div>

      {tokenPoints.length === 0 ? (
        <div className="fst-tokens__empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.2" strokeLinecap="round">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          </svg>
          <p>Token data will appear here after the first response.</p>
          <p className="fst-tokens__hint">Token usage is reported by the API on each <code>response.done</code> event.</p>
        </div>
      ) : (
        <>
          <div className="fst-tokens__charts">
            <div className="fst-tokens__chart-block">
              <div className="fst-tokens__chart-title">
                <span className="fst-tokens__chart-dot" style={{ background: '#bc8cff' }} />
                Cumulative Total Tokens
              </div>
              <TokenSparkline points={tokenPoints} field="cumulativeTotal" color="#bc8cff" height={90} />
            </div>
            <div className="fst-tokens__chart-block">
              <div className="fst-tokens__chart-title">
                <span className="fst-tokens__chart-dot" style={{ background: '#6BAFFF' }} />
                Cumulative Input
                <span className="fst-tokens__chart-dot" style={{ background: '#47D05A', marginLeft: 8 }} />
                Cumulative Output
              </div>
              <div className="fst-tokens__chart-overlay">
                <TokenSparkline points={tokenPoints} field="cumulativeInput" color="#6BAFFF" height={90} />
                <TokenSparkline points={tokenPoints} field="cumulativeOutput" color="#47D05A" height={90} />
              </div>
            </div>
          </div>

          <div className="fst-tokens__table-wrap">
            <div className="fst-tokens__table-title">Per-Response Breakdown</div>
            <table className="fst-tokens__table">
              <thead>
                <tr>
                  <th>#</th><th>Time</th><th>Input</th><th>Output</th>
                  <th>Total</th><th>Δ Cost</th><th>Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {tokenPoints.map((pt) => {
                  const turnCost = estimateCost(
                    { inputTokens: pt.inputTokens, outputTokens: pt.outputTokens, totalTokens: pt.totalTokens },
                    model,
                  );
                  return (
                    <tr key={pt.responseIndex}>
                      <td className="fst-tokens__td-num">{pt.responseIndex + 1}</td>
                      <td className="fst-tokens__td-time">+{formatDelta(pt.timestamp - sessionStart)}</td>
                      <td style={{ color: '#6BAFFF' }}>{pt.inputTokens.toLocaleString()}</td>
                      <td style={{ color: '#47D05A' }}>{pt.outputTokens.toLocaleString()}</td>
                      <td>{pt.totalTokens.toLocaleString()}</td>
                      <td style={{ color: '#E5A922' }}>{formatCost(turnCost)}</td>
                      <td className="fst-tokens__td-cum">{pt.cumulativeTotal.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="fst-tokens__note">
        Input tokens include the full conversation context (prior turns + system prompt).
        Each turn's input grows as context accumulates — use compaction strategies to control this.
      </div>
    </div>
  );
}
