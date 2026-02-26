import { useState, useCallback } from 'react';
import {
    ASSET_CLASSES,
    PORTFOLIO_PRESETS,
    buildPortfolioFromAllocations,
    type AssetClassInfo,
    type PortfolioPreset,
} from '../data/assetClasses';
import { CsvUpload } from './CsvUpload';
import type { Portfolio } from '../types';

interface PortfolioBuilderProps {
    onApply: (portfolio: Portfolio, allocations: Record<string, number>) => void;
    onClose: () => void;
    initialAllocations?: Record<string, number>;
}

function defaultAllocations(): Record<string, number> {
    return Object.fromEntries(ASSET_CLASSES.map(ac => [ac.id, ac.id === 'equities' ? 60 : ac.id === 'bonds' ? 30 : ac.id === 'commodities' ? 10 : 0]));
}

export function PortfolioBuilder({ onApply, onClose, initialAllocations }: PortfolioBuilderProps) {
    const [allocations, setAllocations] = useState<Record<string, number>>(
        initialAllocations
            ? Object.fromEntries(Object.entries(initialAllocations).map(([k, v]) => [k, Math.round(v * 100)]))
            : defaultAllocations()
    );
    const [showCsv, setShowCsv] = useState(false);

    const total = Object.values(allocations).reduce((s, v) => s + v, 0);

    const setWeight = useCallback((id: string, val: number) => {
        setAllocations(prev => ({ ...prev, [id]: val }));
    }, []);

    const applyPreset = useCallback((preset: PortfolioPreset) => {
        setAllocations(
            Object.fromEntries(ASSET_CLASSES.map(ac => [ac.id, Math.round((preset.allocations[ac.id] ?? 0) * 100)]))
        );
    }, []);

    const normalize = useCallback(() => {
        if (total === 0) return;
        setAllocations(prev => {
            const entries = Object.entries(prev);
            const normalized: Record<string, number> = {};
            let remaining = 100;
            for (let i = 0; i < entries.length; i++) {
                const [k, v] = entries[i];
                if (i === entries.length - 1) {
                    normalized[k] = remaining;
                } else {
                    const n = Math.round((v / total) * 100);
                    normalized[k] = n;
                    remaining -= n;
                }
            }
            return normalized;
        });
    }, [total]);

    const handleApply = useCallback(() => {
        // Normalize to 0-1 range
        const normalized: Record<string, number> = {};
        const t = Object.values(allocations).reduce((s, v) => s + v, 0) || 100;
        for (const [k, v] of Object.entries(allocations)) {
            normalized[k] = v / t;
        }
        const portfolio = buildPortfolioFromAllocations(normalized);
        onApply(portfolio, normalized);
    }, [allocations, onApply]);

    const handleCsvParsed = useCallback((parsed: Record<string, number>) => {
        // parsed values are already 0-100 integers
        setAllocations(parsed);
        setShowCsv(false);
    }, []);

    return (
        <div className="builder-backdrop" onClick={onClose}>
            <div className="builder-panel" onClick={e => e.stopPropagation()}>
                <div className="builder-header">
                    <h2 className="builder-title">Build Your Portfolio</h2>
                    <button className="builder-close" onClick={onClose} aria-label="Close portfolio builder">✕</button>
                </div>

                {/* Preset buttons */}
                <div className="builder-presets">
                    {PORTFOLIO_PRESETS.map(p => (
                        <button
                            key={p.id}
                            className="builder-preset-btn"
                            onClick={() => applyPreset(p)}
                        >
                            {p.name}
                        </button>
                    ))}
                    <button
                        className="builder-preset-btn builder-csv-btn"
                        onClick={() => setShowCsv(!showCsv)}
                    >
                        {showCsv ? 'Hide CSV' : '📄 Upload CSV'}
                    </button>
                </div>

                {/* CSV Upload */}
                {showCsv && (
                    <CsvUpload onParsed={handleCsvParsed} />
                )}

                {/* Sliders */}
                <div className="builder-sliders">
                    {ASSET_CLASSES.map((ac: AssetClassInfo) => (
                        <SliderRow
                            key={ac.id}
                            assetClass={ac}
                            value={allocations[ac.id] ?? 0}
                            onChange={(v) => setWeight(ac.id, v)}
                        />
                    ))}
                </div>

                {/* Total bar */}
                <div className="builder-total-row">
                    <div className="builder-total-bar">
                        <div
                            className="builder-total-fill"
                            style={{
                                width: `${Math.min(total, 100)}%`,
                                background: total === 100 ? 'var(--color-accent)' : total > 100 ? 'var(--color-danger)' : 'var(--color-warning)',
                            }}
                        />
                    </div>
                    <span className={`builder-total-label ${total !== 100 ? 'builder-total-warn' : ''}`}>
                        {total}%
                    </span>
                    {total !== 100 && total > 0 && (
                        <button className="builder-normalize-btn" onClick={normalize}>
                            Auto-fix to 100%
                        </button>
                    )}
                </div>

                {/* Apply */}
                <button
                    className="builder-apply-btn"
                    onClick={handleApply}
                    disabled={total === 0}
                >
                    Apply Portfolio
                </button>
            </div>
        </div>
    );
}

// ── Slider Row ─────────────────────────────────────────────────
function SliderRow({ assetClass, value, onChange }: {
    assetClass: AssetClassInfo;
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="slider-row">
            <div className="slider-label">
                <span className="slider-dot" style={{ background: assetClass.color }} />
                <span className="slider-name">{assetClass.name}</span>
                <span className="slider-desc">{assetClass.description}</span>
            </div>
            <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="slider-input"
                style={{ '--slider-color': assetClass.color } as React.CSSProperties}
                aria-label={`${assetClass.name} allocation percentage`}
            />
            <span className="slider-value">{value}%</span>
        </div>
    );
}
