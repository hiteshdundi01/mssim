// ═══════════════════════════════════════════════════════════════════
// MSSIM Compute Shader — Merton Jump-Diffusion Monte Carlo
// ═══════════════════════════════════════════════════════════════════
//
// Each thread = 1 particle = 1 portfolio return sample.
// Pipeline: PCG32 PRNG → Box-Muller → Cholesky correlation → Merton → position
//
// Max supported assets: 16 (unrolled in registers).
// ═══════════════════════════════════════════════════════════════════

// ── Uniforms ────────────────────────────────────────────────────
struct SimParams {
    num_assets:     u32,
    num_particles:  u32,
    dt:             f32,    // Time horizon in years (1.0)
    jump_lambda:    f32,    // Poisson intensity (jumps/year)
    jump_mean:      f32,    // μ_J  mean log-jump size
    jump_vol:       f32,    // σ_J  jump size volatility
    seed:           u32,    // Per-dispatch randomization
    _pad:           u32,    // Alignment padding
}

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read> drift:     array<f32>;   // [N]
@group(0) @binding(2) var<storage, read> vol:       array<f32>;   // [N]
@group(0) @binding(3) var<storage, read> cholesky:  array<f32>;   // [N×N] row-major lower-tri
@group(0) @binding(4) var<storage, read> weights:   array<f32>;   // [N]
@group(0) @binding(5) var<storage, read_write> positions: array<vec2<f32>>; // [numParticles]

// ── PCG32 Random Number Generator ───────────────────────────────
// Minimal PCG-XSH-RR with per-thread state.
// Returns uniform u32 in full range.

var<private> pcg_state: u32;
var<private> pcg_inc: u32;

fn pcg_init(seq: u32, init_state: u32) {
    pcg_inc = (seq << 1u) | 1u;
    pcg_state = 0u;
    pcg_next();             // Advance once to mix
    pcg_state += init_state;
    pcg_next();             // Advance again
}

fn pcg_next() -> u32 {
    let old = pcg_state;
    pcg_state = old * 747796405u + pcg_inc;
    let xsh = ((old >> 18u) ^ old) >> 27u;
    let rot = old >> 27u;
    return (xsh >> rot) | (xsh << ((~rot + 1u) & 31u));
}

// Uniform float in (0, 1) — excludes exact 0 to avoid log(0)
fn pcg_f32() -> f32 {
    return f32(pcg_next() >> 1u) / f32(0x7FFFFFFFu) + 1.0e-10;
}

// ── Box-Muller Transform ────────────────────────────────────────
// Returns two independent N(0,1) samples from two uniform samples.

fn box_muller() -> vec2<f32> {
    let u1 = pcg_f32();
    let u2 = pcg_f32();
    let r = sqrt(-2.0 * log(u1));
    let theta = 6.283185307 * u2;  // 2π
    return vec2<f32>(r * cos(theta), r * sin(theta));
}

// ── Main Compute Kernel ─────────────────────────────────────────

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.num_particles) {
        return;
    }

    let n = params.num_assets;
    let dt = params.dt;

    // Initialize PRNG — unique per particle per dispatch
    pcg_init(idx, params.seed ^ (idx * 2654435761u));

    // ── Step 1: Generate N independent standard normals ──────────
    // We need `n` normals. Box-Muller generates 2 at a time.
    // Store in a fixed-size private array (max 16 assets).
    var Z: array<f32, 16>;
    for (var i = 0u; i < n; i += 2u) {
        let pair = box_muller();
        Z[i] = pair.x;
        if (i + 1u < n) {
            Z[i + 1u] = pair.y;
        }
    }

    // ── Step 2: Cholesky correlation  X = L · Z ──────────────────
    // L is lower-triangular, stored row-major flattened.
    // X_i = Σ_{j=0..i} L[i,j] * Z[j]
    var X: array<f32, 16>;
    for (var i = 0u; i < n; i++) {
        var sum = 0.0;
        for (var j = 0u; j <= i; j++) {
            sum += cholesky[i * n + j] * Z[j];
        }
        X[i] = sum;
    }

    // ── Step 3: Merton jump-diffusion per asset ──────────────────
    // R_i = (μ_i - σ_i²/2) * dt + σ_i * √dt * X_i  +  J_i
    let sqrt_dt = sqrt(dt);
    var portfolio_return = 0.0;

    for (var i = 0u; i < n; i++) {
        let mu = drift[i];
        let sigma = vol[i];

        // GBM diffusion component
        var R_i = (mu - 0.5 * sigma * sigma) * dt + sigma * sqrt_dt * X[i];

        // Poisson jump component
        // Approximate: draw uniform, compare to λ·dt for single-jump
        let u_jump = pcg_f32();
        let jump_prob = params.jump_lambda * dt;
        if (u_jump < jump_prob) {
            // Jump occurs — draw jump size from N(jumpMean, jumpVol²)
            let jump_normal = box_muller();
            let J = params.jump_mean + params.jump_vol * jump_normal.x;
            R_i += J;
        }

        // Weighted contribution
        portfolio_return += weights[i] * R_i;
    }

    // ── Step 4: Map to screen position ───────────────────────────
    // x: horizontal spread (normalized particle index with jitter)
    // y: portfolio return (raw value, render shader will scale)
    let jitter = (pcg_f32() - 0.5) * 0.002;    // Tiny horizontal jitter
    let x = f32(idx) / f32(params.num_particles) + jitter;
    let y = portfolio_return;

    positions[idx] = vec2<f32>(x, y);
}
