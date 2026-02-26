export function CanvasOverlay() {
    return (
        <div className="canvas-overlay" aria-hidden="true">
            {/* Y-axis labels */}
            <div className="axis-y">
                <span className="axis-label" style={{ top: '5%' }}>+50%</span>
                <span className="axis-label" style={{ top: '25%' }}>+25%</span>
                <span className="axis-label axis-zero" style={{ top: '45%' }}>0%</span>
                <span className="axis-label" style={{ top: '65%' }}>–25%</span>
                <span className="axis-label" style={{ top: '85%' }}>–50%</span>
            </div>

            {/* Tail risk threshold line */}
            <div className="threshold-line" style={{ top: '72%' }}>
                <span className="threshold-label">–30% tail risk</span>
            </div>

            {/* X-axis label */}
            <div className="axis-x">
                <span>← More Likely · Outcome Distribution · Less Likely →</span>
            </div>
        </div>
    );
}
