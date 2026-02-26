import { ASSET_CLASSES } from '../data/assetClasses';

interface PortfolioPanelProps {
    allocations: Record<string, number>; // 0–1 weights
    onEdit: () => void;
}

export function PortfolioPanel({ allocations, onEdit }: PortfolioPanelProps) {
    const entries = ASSET_CLASSES
        .filter(ac => (allocations[ac.id] ?? 0) > 0.001)
        .map(ac => ({ ...ac, weight: allocations[ac.id] ?? 0 }))
        .sort((a, b) => b.weight - a.weight);

    if (entries.length === 0) return null;

    // Build conic-gradient stops for pie chart
    let cumulative = 0;
    const stops = entries.map(e => {
        const start = cumulative * 360;
        cumulative += e.weight;
        const end = cumulative * 360;
        return `${e.color} ${start}deg ${end}deg`;
    });
    const gradient = `conic-gradient(${stops.join(', ')})`;

    return (
        <div className="portfolio-panel">
            <div className="portfolio-header">
                <span className="portfolio-title">Your Portfolio</span>
                <button className="portfolio-edit-btn" onClick={onEdit} aria-label="Edit portfolio">
                    ✎ Edit
                </button>
            </div>

            {/* Pie chart */}
            <div className="portfolio-pie-container">
                <div className="portfolio-pie" style={{ background: gradient }} />
            </div>

            {/* Holdings list */}
            <div className="portfolio-holdings">
                {entries.map(e => (
                    <div key={e.id} className="portfolio-holding-row">
                        <span className="portfolio-holding-dot" style={{ background: e.color }} />
                        <span className="portfolio-holding-name">{e.name}</span>
                        <span className="portfolio-holding-weight">{(e.weight * 100).toFixed(0)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
