// ── Distribution Statistics ─────────────────────────────────────
//
// Computes portfolio return statistics from GPU readback data.

export interface SimStats {
    mean: number;
    stdDev: number;
    var95: number;       // Value at Risk (5th percentile)
    cvar95: number;      // Conditional VaR (mean below VaR)
    min: number;
    max: number;
    tailPct: number;     // % of particles below -30%
    skewness: number;
}

/**
 * Compute statistics from an array of portfolio returns.
 * The positions buffer is vec2<f32> — we extract every 2nd element (y = return).
 */
export function computeStats(positions: Float32Array, numParticles: number): SimStats {
    // Extract Y values (portfolio returns)
    const returns = new Float32Array(numParticles);
    for (let i = 0; i < numParticles; i++) {
        returns[i] = positions[i * 2 + 1];
    }

    // Sort for percentile computation
    const sorted = Float32Array.from(returns).sort();

    // Mean
    let sum = 0;
    for (let i = 0; i < numParticles; i++) sum += returns[i];
    const mean = sum / numParticles;

    // Std dev & skewness
    let sumSq = 0;
    let sumCubed = 0;
    for (let i = 0; i < numParticles; i++) {
        const d = returns[i] - mean;
        sumSq += d * d;
        sumCubed += d * d * d;
    }
    const variance = sumSq / numParticles;
    const stdDev = Math.sqrt(variance);
    const skewness = stdDev > 0 ? (sumCubed / numParticles) / (stdDev * stdDev * stdDev) : 0;

    // VaR 95% (5th percentile)
    const varIdx = Math.floor(numParticles * 0.05);
    const var95 = sorted[varIdx];

    // CVaR 95% (mean of returns below VaR)
    let cvarSum = 0;
    for (let i = 0; i <= varIdx; i++) cvarSum += sorted[i];
    const cvar95 = varIdx > 0 ? cvarSum / (varIdx + 1) : var95;

    // Min, Max
    const min = sorted[0];
    const max = sorted[numParticles - 1];

    // Tail % (below -30%)
    let tailCount = 0;
    for (let i = 0; i < numParticles; i++) {
        if (returns[i] < -0.30) tailCount++;
    }
    const tailPct = (tailCount / numParticles) * 100;

    return { mean, stdDev, var95, cvar95, min, max, tailPct, skewness };
}
