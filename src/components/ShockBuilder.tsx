import { useState, useCallback, useMemo } from 'react';
import { SHOCKS } from '../data/shocks';
import { ASSET_CLASSES } from '../data/assetClasses';
import type { MacroShock, EngineOutput, Portfolio } from '../types';
import { runEngine } from '../engine';

interface ShockBuilderProps {
    portfolio: Portfolio;
    allocations: Record<string, number>;
    onComputed: (output: EngineOutput, shockName: string, shockId: string) => void;
}

// Interpolation anchors
const ANCHORS = {
    low: SHOCKS.rate_hike,
    mid: SHOCKS.stagflation,
    high: SHOCKS.black_swan,
};

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function buildInterpolatedShock(severity: number, assetCount: number): MacroShock {
    // severity 0-100 maps to rate_hike → stagflation → black_swan
    const t = severity / 100;

    // Two-segment interpolation: 0-0.5 = low→mid, 0.5-1.0 = mid→high
    let from: MacroShock, to: MacroShock, localT: number;
    if (t <= 0.5) {
        from = ANCHORS.low;
        to = ANCHORS.mid;
        localT = t * 2;
    } else {
        from = ANCHORS.mid;
        to = ANCHORS.high;
        localT = (t - 0.5) * 2;
    }

    // Per-asset arrays: repeat/cycle based on asset count
    const deltaDrift: number[] = [];
    const volMultiplier: number[] = [];
    for (let i = 0; i < assetCount; i++) {
        const fi = i % from.deltaDrift.length;
        const ti = i % to.deltaDrift.length;
        deltaDrift.push(lerp(from.deltaDrift[fi], to.deltaDrift[ti], localT));
        volMultiplier.push(lerp(from.volMultiplier[fi], to.volMultiplier[ti], localT));
    }

    return {
        id: 'custom',
        name: `Custom (${severity}%)`,
        deltaDrift,
        volMultiplier,
        correlationSkew: lerp(from.correlationSkew, to.correlationSkew, localT),
        jumpLambda: lerp(from.jumpLambda, to.jumpLambda, localT),
        jumpMean: lerp(from.jumpMean, to.jumpMean, localT),
        jumpVol: lerp(from.jumpVol, to.jumpVol, localT),
    };
}

const SEVERITY_LABELS: [number, string][] = [
    [0, 'Calm'],
    [20, 'Mild Stress'],
    [40, 'Moderate'],
    [60, 'Severe'],
    [80, 'Crisis'],
    [100, 'Meltdown'],
];

function getSeverityLabel(val: number): string {
    for (let i = SEVERITY_LABELS.length - 1; i >= 0; i--) {
        if (val >= SEVERITY_LABELS[i][0]) return SEVERITY_LABELS[i][1];
    }
    return 'Calm';
}

export function ShockBuilder({ portfolio, allocations, onComputed }: ShockBuilderProps) {
    const [severity, setSeverity] = useState(50);

    const assetCount = useMemo(() => {
        return ASSET_CLASSES.filter(ac => (allocations[ac.id] ?? 0) > 0.001).length;
    }, [allocations]);

    const handleRun = useCallback(() => {
        const shock = buildInterpolatedShock(severity, assetCount);
        try {
            const result = runEngine(portfolio, shock);
            onComputed(result, shock.name, 'custom');
        } catch (e) {
            console.error('[MSSIM] Custom shock error:', e);
        }
    }, [severity, assetCount, portfolio, onComputed]);

    const label = getSeverityLabel(severity);
    const hue = 180 - (severity / 100) * 180; // cyan → red

    return (
        <div className="shock-builder">
            <div className="shock-builder-header">
                <span className="shock-builder-title">Custom Severity</span>
                <span
                    className="shock-builder-label"
                    style={{ color: `hsl(${hue}, 80%, 60%)` }}
                >
                    {label} — {severity}%
                </span>
            </div>
            <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={severity}
                onChange={e => setSeverity(Number(e.target.value))}
                className="shock-severity-slider"
                style={{ '--severity-hue': hue } as React.CSSProperties}
                aria-label="Crisis severity level"
            />
            <div className="shock-severity-labels">
                <span>Calm</span>
                <span>Moderate</span>
                <span>Meltdown</span>
            </div>
            <button className="shock-run-btn" onClick={handleRun}>
                Run Simulation
            </button>
        </div>
    );
}
