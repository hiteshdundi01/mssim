import type { Portfolio, MacroShock, EngineOutput } from './types';

// ── WASM import — will be resolved after wasm-pack build ────────
// For now, we use a JS-only fallback so the UI can render before
// the Rust engine is compiled. The fallback performs NO math —
// it returns identity/placeholder values.

let wasmModule: typeof import('./wasm/engine/mssim_engine') | null = null;

async function loadWasm() {
    try {
        const mod = await import('./wasm/engine/mssim_engine');
        await mod.default();           // init WASM
        wasmModule = mod;
        console.log('[MSSIM] WASM engine loaded');
    } catch {
        console.warn('[MSSIM] WASM engine not available — using JS fallback');
    }
}

// Kick off loading immediately
const wasmReady = loadWasm();

/**
 * JS-only fallback for when WASM is not yet compiled.
 * Returns adjusted drift/vol and an identity Cholesky matrix.
 */
function fallbackEngine(p: Portfolio, s: MacroShock): EngineOutput {
    const n = p.assets.length;

    const adjustedDrift = new Float32Array(n);
    const adjustedVol = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        adjustedDrift[i] = p.baseDrift[i] + s.deltaDrift[i];
        adjustedVol[i] = p.baseVol[i] * s.volMultiplier[i];
    }

    // Identity Cholesky (no correlation) as placeholder
    const choleskyL = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
        choleskyL[i * n + i] = adjustedVol[i];
    }

    return {
        adjustedDrift,
        adjustedVol,
        choleskyL,
        numAssets: n,
        jumpLambda: s.jumpLambda,
        jumpMean: s.jumpMean,
        jumpVol: s.jumpVol,
    };
}

/**
 * Run the math engine. Uses WASM if loaded, otherwise JS fallback.
 */
export function runEngine(p: Portfolio, s: MacroShock): EngineOutput {
    if (wasmModule) {
        const n = p.assets.length;
        const result = wasmModule.compute_shock(
            n,
            new Float32Array(p.baseDrift),
            new Float32Array(p.baseVol),
            new Float32Array(p.baseCorrelation),
            new Float32Array(s.deltaDrift),
            new Float32Array(s.volMultiplier),
            s.correlationSkew,
            s.jumpLambda,
            s.jumpMean,
            s.jumpVol,
        );
        return {
            adjustedDrift: result.adjusted_drift,
            adjustedVol: result.adjusted_vol,
            choleskyL: result.cholesky_l,
            numAssets: n,
            jumpLambda: s.jumpLambda,
            jumpMean: s.jumpMean,
            jumpVol: s.jumpVol,
        };
    }

    return fallbackEngine(p, s);
}

/** Await this if you need to guarantee WASM is loaded before first use. */
export { wasmReady };
