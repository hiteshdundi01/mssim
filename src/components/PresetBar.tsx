import { useState, useCallback } from 'react';
import type { MacroShock, EngineOutput, Portfolio } from '../types';
import { SHOCK_LIST } from '../data/shocks';
import { adaptShockToPortfolio } from '../data/assetClasses';
import { runEngine } from '../engine';
import { ShockBuilder } from './ShockBuilder';

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
    portfolio: Portfolio;
    allocations: Record<string, number>;
    onComputed?: (output: EngineOutput, shockName: string, shockId: string) => void;
}

export function PresetBar({ portfolio, allocations, onComputed }: PresetBarProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showCustom, setShowCustom] = useState(false);

    const handleShock = useCallback((shock: MacroShock) => {
        setActiveId(shock.id);
        setShowCustom(false);
        setError(null);
        try {
            // Adapt shock arrays to match current portfolio's asset count
            const adapted = adaptShockToPortfolio(shock.id, allocations);
            const result = runEngine(portfolio, adapted);
            onComputed?.(result, shock.name, shock.id);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            console.error(`[MSSIM] Engine error:`, e);
        }
    }, [portfolio, allocations, onComputed]);

    const handleCustomComputed = useCallback((output: EngineOutput, shockName: string, shockId: string) => {
        setActiveId('custom');
        onComputed?.(output, shockName, shockId);
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
                        aria-label={`${shock.name} scenario: ${SHOCK_DESCRIPTIONS[shock.id] ?? ''}`}
                    >
                        {shock.name}
                    </button>
                ))}
                <button
                    className={`preset-btn preset-btn-custom ${activeId === 'custom' || showCustom ? 'active' : ''}`}
                    onClick={() => { setShowCustom(!showCustom); setActiveId(showCustom ? null : 'custom'); }}
                    aria-label="Create a custom shock scenario"
                >
                    ⚡ Custom
                </button>
            </div>

            {/* Custom shock builder */}
            {showCustom && (
                <ShockBuilder
                    portfolio={portfolio}
                    allocations={allocations}
                    onComputed={handleCustomComputed}
                />
            )}

            {activeId && !showCustom && SHOCK_DESCRIPTIONS[activeId] && (
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
