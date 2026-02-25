import { useState, useCallback } from 'react';
import type { MacroShock, EngineOutput } from '../types';
import { SHOCK_LIST } from '../data/shocks';
import { DEFAULT_PORTFOLIO } from '../data/portfolio';
import { runEngine } from '../engine';

interface PresetBarProps {
    onComputed?: (output: EngineOutput) => void;
}

export function PresetBar({ onComputed }: PresetBarProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [output, setOutput] = useState<EngineOutput | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleShock = useCallback((shock: MacroShock) => {
        setActiveId(shock.id);
        setError(null);
        try {
            const result = runEngine(DEFAULT_PORTFOLIO, shock);
            setOutput(result);
            console.log(`[MSSIM] Engine output for "${shock.name}":`, {
                adjustedDrift: Array.from(result.adjustedDrift),
                adjustedVol: Array.from(result.adjustedVol),
                choleskyL: Array.from(result.choleskyL),
                numAssets: result.numAssets,
                jumpLambda: result.jumpLambda,
                jumpMean: result.jumpMean,
                jumpVol: result.jumpVol,
            });
            // Notify parent to dispatch GPU compute
            onComputed?.(result);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            console.error(`[MSSIM] Engine error:`, e);
        }
    }, [onComputed]);

    return (
        <div className="preset-bar">
            {SHOCK_LIST.map((shock) => (
                <button
                    key={shock.id}
                    className={`preset-btn ${activeId === shock.id ? 'active' : ''}`}
                    onClick={() => handleShock(shock)}
                >
                    {shock.name}
                </button>
            ))}
            {error && (
                <span className="status-label" style={{ color: 'var(--color-danger)' }}>
                    {error}
                </span>
            )}
            {output && !error && (
                <span className="status-label" style={{ color: 'var(--color-accent)' }}>
                    L[{output.choleskyL.length}] μ[{output.adjustedDrift.length}] σ[{output.adjustedVol.length}]
                </span>
            )}
        </div>
    );
}
