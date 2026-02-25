// ── Portfolio: base state of the portfolio ──────────────────────
export interface Portfolio {
    assets: string[];
    weights: number[];           // Must sum to 1.0
    baseDrift: number[];         // Expected returns (mu), annualized
    baseVol: number[];           // Historical volatility (sigma), annualized
    baseCorrelation: number[];   // Flattened NxN correlation matrix, row-major
}

// ── MacroShock: AI-generated (Phase 1: hardcoded) perturbation ──
export interface MacroShock {
    id: string;
    name: string;
    deltaDrift: number[];        // Additive adjustments to baseDrift
    volMultiplier: number[];     // Multipliers for baseVol
    correlationSkew: number;     // 0..1, blends R toward all-ones matrix
    jumpLambda: number;          // Poisson intensity (jumps/year)
    jumpMean: number;            // μ_J — mean log-jump size
    jumpVol: number;             // σ_J — jump size volatility
}

// ── EngineOutput: WASM → JS → GPU handoff ───────────────────────
export interface EngineOutput {
    adjustedDrift: Float32Array;
    adjustedVol: Float32Array;
    choleskyL: Float32Array;     // Flattened lower-triangular NxN
    numAssets: number;
    jumpLambda: number;
    jumpMean: number;
    jumpVol: number;
}
