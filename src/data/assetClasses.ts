import type { Portfolio } from '../types';

// ── Asset Class Metadata ────────────────────────────────────────
export interface AssetClassInfo {
    id: string;
    name: string;
    baseDrift: number;   // annualized expected return
    baseVol: number;     // annualized volatility
    color: string;       // for pie chart / UI
    description: string;
}

export const ASSET_CLASSES: AssetClassInfo[] = [
    { id: 'equities', name: 'Equities', baseDrift: 0.08, baseVol: 0.18, color: '#00e5ff', description: 'Stocks & equity funds' },
    { id: 'bonds', name: 'Bonds', baseDrift: 0.03, baseVol: 0.06, color: '#7c4dff', description: 'Government & corporate bonds' },
    { id: 'commodities', name: 'Commodities', baseDrift: 0.05, baseVol: 0.22, color: '#ff9f43', description: 'Gold, oil, raw materials' },
    { id: 'real_estate', name: 'Real Estate', baseDrift: 0.06, baseVol: 0.14, color: '#26a69a', description: 'REITs & property funds' },
    { id: 'cash', name: 'Cash', baseDrift: 0.02, baseVol: 0.01, color: '#78909c', description: 'Money market & savings' },
];

// Pairwise correlations between the 5 asset classes (symmetric)
// Order: equities, bonds, commodities, real_estate, cash
const BASE_CORRELATIONS: Record<string, Record<string, number>> = {
    equities: { equities: 1.0, bonds: 0.2, commodities: 0.3, real_estate: 0.6, cash: 0.0 },
    bonds: { equities: 0.2, bonds: 1.0, commodities: -0.1, real_estate: 0.15, cash: 0.3 },
    commodities: { equities: 0.3, bonds: -0.1, commodities: 1.0, real_estate: 0.2, cash: 0.0 },
    real_estate: { equities: 0.6, bonds: 0.15, commodities: 0.2, real_estate: 1.0, cash: 0.05 },
    cash: { equities: 0.0, bonds: 0.3, commodities: 0.0, real_estate: 0.05, cash: 1.0 },
};

// ── Portfolio Presets ────────────────────────────────────────────
export interface PortfolioPreset {
    id: string;
    name: string;
    allocations: Record<string, number>; // asset class id → weight (0–1)
}

export const PORTFOLIO_PRESETS: PortfolioPreset[] = [
    {
        id: 'conservative',
        name: 'Conservative',
        allocations: { equities: 0.20, bonds: 0.55, commodities: 0.05, real_estate: 0.10, cash: 0.10 },
    },
    {
        id: 'balanced',
        name: 'Balanced',
        allocations: { equities: 0.60, bonds: 0.30, commodities: 0.10, real_estate: 0.00, cash: 0.00 },
    },
    {
        id: 'aggressive',
        name: 'Aggressive',
        allocations: { equities: 0.80, bonds: 0.05, commodities: 0.10, real_estate: 0.05, cash: 0.00 },
    },
];

// ── Ticker → Asset Class Mapping (for CSV upload) ───────────────
const TICKER_MAP: Record<string, string> = {
    // Equities
    SPY: 'equities', VOO: 'equities', VTI: 'equities', QQQ: 'equities',
    IVV: 'equities', AAPL: 'equities', MSFT: 'equities', GOOG: 'equities',
    AMZN: 'equities', TSLA: 'equities', META: 'equities', NVDA: 'equities',
    VEA: 'equities', VWO: 'equities', SCHF: 'equities', EFA: 'equities',
    // Bonds
    BND: 'bonds', AGG: 'bonds', TLT: 'bonds', IEF: 'bonds',
    SHY: 'bonds', VCIT: 'bonds', LQD: 'bonds', HYG: 'bonds',
    TIP: 'bonds', VGIT: 'bonds', SCHZ: 'bonds',
    // Commodities
    GLD: 'commodities', SLV: 'commodities', IAU: 'commodities',
    USO: 'commodities', DBC: 'commodities', PDBC: 'commodities',
    // Real Estate
    VNQ: 'real_estate', SCHH: 'real_estate', IYR: 'real_estate',
    XLRE: 'real_estate', REM: 'real_estate',
    // Cash / Short-term
    SHV: 'cash', BIL: 'cash', SGOV: 'cash', VMFXX: 'cash',
};

export function resolveTickerToAssetClass(ticker: string): string | null {
    return TICKER_MAP[ticker.toUpperCase()] ?? null;
}

// ── Build Portfolio from allocations ────────────────────────────
export function buildPortfolioFromAllocations(
    allocations: Record<string, number>,
): Portfolio {
    // Filter to only asset classes with weight > 0
    const entries = ASSET_CLASSES
        .filter(ac => (allocations[ac.id] ?? 0) > 0)
        .map(ac => ({ ac, weight: allocations[ac.id] }));

    if (entries.length === 0) {
        // Fallback to balanced
        return buildPortfolioFromAllocations(PORTFOLIO_PRESETS[1].allocations);
    }

    const assets = entries.map(e => e.ac.name);
    const weights = entries.map(e => e.weight);
    const baseDrift = entries.map(e => e.ac.baseDrift);
    const baseVol = entries.map(e => e.ac.baseVol);

    // Build correlation matrix for selected assets
    const n = entries.length;
    const baseCorrelation: number[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const idI = entries[i].ac.id;
            const idJ = entries[j].ac.id;
            baseCorrelation.push(BASE_CORRELATIONS[idI][idJ]);
        }
    }

    return { assets, weights, baseDrift, baseVol, baseCorrelation };
}

// ── Build shock arrays matching asset count ─────────────────────
// When the user changes portfolio size, shocks must be resized too.
// This maps each selected asset class to the "closest" default shock value.
import { SHOCKS } from './shocks';
import type { MacroShock } from '../types';

const SHOCK_DEFAULTS_BY_CLASS: Record<string, Record<string, { deltaDrift: number; volMultiplier: number }>> = {
    rate_hike: {
        equities: { deltaDrift: -0.02, volMultiplier: 1.3 },
        bonds: { deltaDrift: 0.01, volMultiplier: 1.1 },
        commodities: { deltaDrift: -0.01, volMultiplier: 1.2 },
        real_estate: { deltaDrift: -0.03, volMultiplier: 1.4 },
        cash: { deltaDrift: 0.005, volMultiplier: 1.0 },
    },
    black_swan: {
        equities: { deltaDrift: -0.15, volMultiplier: 3.0 },
        bonds: { deltaDrift: 0.05, volMultiplier: 1.8 },
        commodities: { deltaDrift: -0.08, volMultiplier: 2.5 },
        real_estate: { deltaDrift: -0.12, volMultiplier: 2.8 },
        cash: { deltaDrift: 0.01, volMultiplier: 1.0 },
    },
    stagflation: {
        equities: { deltaDrift: -0.06, volMultiplier: 1.8 },
        bonds: { deltaDrift: -0.02, volMultiplier: 1.4 },
        commodities: { deltaDrift: 0.04, volMultiplier: 2.0 },
        real_estate: { deltaDrift: -0.04, volMultiplier: 1.6 },
        cash: { deltaDrift: 0.005, volMultiplier: 1.0 },
    },
};

/**
 * Adapt a shock preset to match the current portfolio's asset classes.
 */
export function adaptShockToPortfolio(
    shockId: string,
    allocations: Record<string, number>,
): MacroShock {
    const baseShock = SHOCKS[shockId];
    if (!baseShock) throw new Error(`Unknown shock: ${shockId}`);

    const entries = ASSET_CLASSES.filter(ac => (allocations[ac.id] ?? 0) > 0);
    const defaults = SHOCK_DEFAULTS_BY_CLASS[shockId];

    const deltaDrift = entries.map(ac => defaults?.[ac.id]?.deltaDrift ?? -0.02);
    const volMultiplier = entries.map(ac => defaults?.[ac.id]?.volMultiplier ?? 1.2);

    return {
        ...baseShock,
        deltaDrift,
        volMultiplier,
    };
}
