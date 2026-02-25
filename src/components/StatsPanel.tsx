import type { SimStats } from '../stats';

interface StatsPanelProps {
    stats: SimStats | null;
}

function fmt(val: number, decimals = 2): string {
    return (val * 100).toFixed(decimals) + '%';
}

function fmtSigned(val: number, decimals = 2): string {
    const pct = (val * 100).toFixed(decimals);
    return val >= 0 ? `+${pct}%` : `${pct}%`;
}

const STAT_TOOLTIPS: Record<string, string> = {
    avg: 'The typical outcome across all 100,000 simulations',
    spread: 'How widely the results are scattered — higher means more uncertainty',
    lopsided: 'Negative means more downside surprises than upside ones',
    worst20: "In the worst 5% of outcomes, you'd lose at least this much",
    avgWorst: "When things go really bad, this is the average loss you'd experience",
    worst: 'The single worst outcome out of 100,000 simulations',
    best: 'The single best outcome out of 100,000 simulations',
    crash: 'The chance of losing more than 30% of your portfolio',
};

export function StatsPanel({ stats }: StatsPanelProps) {
    if (!stats) return null;

    return (
        <div className="stats-panel">
            <div className="stats-title">Your Portfolio Results</div>
            <div className="stats-grid">
                <StatRow
                    label="Avg. Return"
                    value={fmtSigned(stats.mean)}
                    tip={STAT_TOOLTIPS.avg}
                />
                <StatRow
                    label="Spread"
                    value={fmt(stats.stdDev)}
                    tip={STAT_TOOLTIPS.spread}
                />
                <StatRow
                    label="Lopsidedness"
                    value={stats.skewness.toFixed(2)}
                    tip={STAT_TOOLTIPS.lopsided}
                />
                <StatRow
                    label="Worst Case (1‑in‑20)"
                    value={fmtSigned(stats.var95)}
                    tip={STAT_TOOLTIPS.worst20}
                    danger
                />
                <StatRow
                    label="Avg. Worst Case"
                    value={fmtSigned(stats.cvar95)}
                    tip={STAT_TOOLTIPS.avgWorst}
                    danger
                />
                <StatRow
                    label="Worst Single Outcome"
                    value={fmtSigned(stats.min)}
                    tip={STAT_TOOLTIPS.worst}
                />
                <StatRow
                    label="Best Single Outcome"
                    value={fmtSigned(stats.max)}
                    tip={STAT_TOOLTIPS.best}
                />
                <StatRow
                    label="Crash Probability"
                    value={stats.tailPct.toFixed(1) + '%'}
                    tip={STAT_TOOLTIPS.crash}
                    danger={stats.tailPct > 1}
                />
            </div>
        </div>
    );
}

function StatRow({ label, value, danger, tip }: {
    label: string;
    value: string;
    danger?: boolean;
    tip?: string;
}) {
    return (
        <>
            <span className="stat-label" title={tip}>{label} {tip && <span className="stat-info">ⓘ</span>}</span>
            <span className={`stat-value ${danger ? 'stat-danger' : ''}`}>{value}</span>
        </>
    );
}
