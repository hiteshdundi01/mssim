import type { ShockResult } from '../types';

interface ComparisonTableProps {
    results: ShockResult[];
}

function fmt(val: number): string {
    const pct = (val * 100).toFixed(1);
    return val >= 0 ? `+${pct}%` : `${pct}%`;
}

function getSeverity(cvar: number): string {
    const pct = Math.abs(cvar * 100);
    if (pct < 5) return 'Low';
    if (pct < 20) return 'Moderate';
    if (pct < 50) return 'High';
    return 'Extreme';
}

export function ComparisonTable({ results }: ComparisonTableProps) {
    if (results.length < 2) return null;

    // Find worst values for highlighting
    const worstVar = Math.min(...results.map(r => r.stats.var95));
    const worstCvar = Math.min(...results.map(r => r.stats.cvar95));
    const worstTail = Math.max(...results.map(r => r.stats.tailPct));

    return (
        <div className="comparison-panel">
            <div className="comparison-title">Scenario Comparison</div>
            <div className="comparison-table-wrapper">
                <table className="comparison-table">
                    <thead>
                        <tr>
                            <th>Scenario</th>
                            <th>Avg. Return</th>
                            <th>Worst 1‑in‑20</th>
                            <th>Avg. Worst</th>
                            <th>Crash Prob.</th>
                            <th>Severity</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map(r => (
                            <tr key={r.shockId}>
                                <td className="comparison-name">{r.shockName}</td>
                                <td>{fmt(r.stats.mean)}</td>
                                <td className={r.stats.var95 === worstVar ? 'stat-danger' : ''}>
                                    {fmt(r.stats.var95)}
                                </td>
                                <td className={r.stats.cvar95 === worstCvar ? 'stat-danger' : ''}>
                                    {fmt(r.stats.cvar95)}
                                </td>
                                <td className={r.stats.tailPct === worstTail && worstTail > 0.5 ? 'stat-danger' : ''}>
                                    {r.stats.tailPct.toFixed(1)}%
                                </td>
                                <td>
                                    <span className={`severity-badge severity-${getSeverity(r.stats.cvar95).toLowerCase()}`}>
                                        {getSeverity(r.stats.cvar95)}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
