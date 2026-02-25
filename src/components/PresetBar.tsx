import { useState, useCallback } from 'react';
import type { MacroShock, EngineOutput } from '../types';
import { SHOCK_LIST } from '../data/shocks';
import { DEFAULT_PORTFOLIO } from '../data/portfolio';
import { runEngine } from '../engine';

const SHOCK_DESCRIPTIONS: Record<string, string> = {
    rate_hike: 'The central bank sharply raises interest rates. Stocks become more volatile and bonds stop protecting your portfolio.',
    black_swan: 'A 2008-style financial meltdown. Everything crashes together. Sudden, large losses become much more likely.',
    stagflation: 'Prices keep rising but the economy stalls. Most investments lose money while raw materials swing wildly.',
};

const SHOCK_SEVERITY: Record<string, string> = {
    rate_hike: 'Severity: Moderate · Crash frequency: Low · Diversification: Weakened',
    black_swan: 'Severity: Extreme · Crash frequency: Very High · Diversification: None',
    stagflation: 'Severity: High · Crash frequency: Medium · Diversification: Partial',
};

interface PresetBarProps {
    onComputed?: (output: EngineOutput) => void;
}

export function PresetBar({ onComputed }: PresetBarProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleShock = useCallback((shock: MacroShock) => {
        setActiveId(shock.id);
        setError(null);
        try {
            const result = runEngine(DEFAULT_PORTFOLIO, shock);
            console.log(`[MSSIM] Engine output for "${shock.name}":`, {
                numAssets: result.numAssets,
                jumpLambda: result.jumpLambda,
            });
            onComputed?.(result);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            console.error(`[MSSIM] Engine error:`, e);
        }
    }, [onComputed]);

    return (
        <div className="preset-bar-container">
            <div className="preset-label">Choose a crisis scenario</div>
            <div className="preset-bar">
                {SHOCK_LIST.map((shock) => (
                    <button
                        key={shock.id}
                        className={`preset-btn ${activeId === shock.id ? 'active' : ''}`}
                        onClick={() => handleShock(shock)}
                        title={SHOCK_SEVERITY[shock.id] ?? ''}
                    >
                        {shock.name}
                    </button>
                ))}
            </div>
            {activeId && SHOCK_DESCRIPTIONS[activeId] && (
                <div className="shock-desc">{SHOCK_DESCRIPTIONS[activeId]}</div>
            )}
            {error && (
                <div className="shock-desc" style={{ color: 'var(--color-danger)' }}>
                    {error}
                </div>
            )}
        </div>
    );
}
