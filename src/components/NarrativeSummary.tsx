import type { SimStats } from '../stats';

interface NarrativeSummaryProps {
    stats: SimStats;
    shockName: string;
}

function getSeverity(cvar: number): { label: string; className: string } {
    const pct = Math.abs(cvar * 100);
    if (pct < 5) return { label: 'Low Risk', className: 'severity-low' };
    if (pct < 20) return { label: 'Moderate', className: 'severity-moderate' };
    if (pct < 50) return { label: 'High Risk', className: 'severity-high' };
    return { label: 'Extreme', className: 'severity-extreme' };
}

export function NarrativeSummary({ stats, shockName }: NarrativeSummaryProps) {
    const severity = getSeverity(stats.cvar95);
    const var95Pct = (Math.abs(stats.var95) * 100).toFixed(1);
    const cvar95Pct = (Math.abs(stats.cvar95) * 100).toFixed(1);
    const tailPct = stats.tailPct.toFixed(1);
    const meanPct = (stats.mean * 100).toFixed(1);
    const isPositiveMean = stats.mean >= 0;

    // Build narrative
    let narrative = `Under a **${shockName}** scenario, `;

    if (stats.var95 < 0) {
        narrative += `your portfolio would lose at least **${var95Pct}%** in the worst 1-in-20 outcome. `;
    } else {
        narrative += `even the worst 1-in-20 outcome still gains **${var95Pct}%**. `;
    }

    if (stats.cvar95 < -0.3) {
        narrative += `The average loss in the worst 5% of scenarios is **${cvar95Pct}%**. `;
    }

    if (stats.tailPct > 0.1) {
        narrative += `There's a **${tailPct}%** chance of losing more than 30% of your investment.`;
    } else {
        narrative += isPositiveMean
            ? `On average, your portfolio gains **${meanPct}%**.`
            : `On average, your portfolio loses **${Math.abs(parseFloat(meanPct))}%**.`;
    }

    return (
        <div className="narrative-panel">
            <div className="narrative-header">
                <span className={`severity-badge ${severity.className}`}>{severity.label}</span>
            </div>
            <p className="narrative-text" dangerouslySetInnerHTML={{
                __html: narrative.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            }} />
        </div>
    );
}
