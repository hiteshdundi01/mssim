# MSSIM — Macro-Shock Particle Simulator

A real-time, browser-based financial physics engine that translates qualitative macroeconomic shocks into quantitative portfolio covariance matrices, then uses **WebGPU** to simulate and render **100,000 Monte Carlo trajectories** as a bioluminescent particle swarm — all in under 1 millisecond.

<br>

> **Try it:** Clone, build WASM, run `npm run dev`, pick a shock preset. That's it.

<br>

## Table of Contents

- [Overview](#overview)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Pipeline Deep Dive](#pipeline-deep-dive)
  - [Stage 1 — Rust/WASM Math Engine](#stage-1--rustwasm-math-engine)
  - [Stage 2 — WebGPU Compute Shader](#stage-2--webgpu-compute-shader)
  - [Stage 3 — Render Pipeline](#stage-3--render-pipeline)
  - [Stage 4 — UI & Analytics](#stage-4--ui--analytics)
- [Shock Presets](#shock-presets)
- [Distribution Statistics](#distribution-statistics)
- [Design Decisions](#design-decisions)
- [Performance](#performance)
- [Browser Compatibility](#browser-compatibility)
- [Development](#development)
- [License](#license)

---

## Overview

MSSIM models what happens to a diversified portfolio when macroeconomic regimes shift. It answers the question: *"If the Fed hikes rates 200bp tomorrow, what does the return distribution of my 60/30/10 portfolio actually look like?"*

The pipeline:

1. **Shock → Covariance** — A Rust/WASM engine adjusts drift, volatility, and correlation matrices. Higham's alternating projections guarantee positive-definiteness. Cholesky decomposition produces the lower-triangular matrix L.

2. **L → 100K Particles** — A WGSL compute shader runs 100,000 parallel threads on the GPU. Each thread uses PCG32 PRNG + Box-Muller transform + Cholesky correlation + Merton jump-diffusion to generate one portfolio return sample.

3. **Particles → Pixels** — A WGSL render shader draws each particle as an instanced billboard quad with additive blending. Cyan for normal returns, orange-to-red for tail risk.

4. **Pixels → Insights** — A stats panel computes VaR, CVaR, skewness, and tail-risk percentages from GPU readback data.

---

## Screenshots

### Rate Hike Scenario
Tight distribution with moderate left tail. VaR 95% ≈ -1%, zero particles below -30%.

### Black Swan Scenario
Extreme fat tails. VaR 95% ≈ -65%, CVaR 95% ≈ -96%, 8% of particles below -30%.

### Stagflation Scenario
Intermediate regime — wider than Rate Hike, narrower than Black Swan. Negative drift across assets.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│  ┌──────────┐    ┌────────────┐    ┌──────────────────────┐ │
│  │  React   │───▶│ engine.ts  │───▶│   WASM (Rust)        │ │
│  │  UI      │    │ (wrapper)  │    │   nalgebra math      │ │
│  │          │    │            │◀───│   Cholesky, PD, etc. │ │
│  └──────────┘    └─────┬──────┘    └──────────────────────┘ │
│                        │                                    │
│                        │ Float32Array                       │
│                        ▼                                    │
│              ┌──────────────────┐                           │
│              │  WebGPU          │                           │
│              │  ┌─────────────┐ │                           │
│              │  │ Compute     │ │  ← 100K parallel threads  │
│              │  │ Shader      │ │    PCG32 + Box-Muller     │
│              │  │ (WGSL)      │ │    Merton jump-diffusion  │
│              │  └──────┬──────┘ │                           │
│              │         │        │                           │
│              │  ┌──────▼──────┐ │                           │
│              │  │ Render      │ │  ← Additive blending      │
│              │  │ Shader      │ │    Bioluminescent colors   │
│              │  │ (WGSL)      │ │    Tail-risk red/orange    │
│              │  └──────┬──────┘ │                           │
│              │         │        │                           │
│              │  ┌──────▼──────┐ │                           │
│              │  │ Readback    │ │  ← Async staging buffer   │
│              │  │ → Stats     │ │    VaR, CVaR, skewness    │
│              │  └─────────────┘ │                           │
│              └──────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

**Data flow:** React → WASM (Rust) → GPU Compute → GPU Render → Canvas + CPU Readback → Stats Panel

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React 19, TypeScript, Vite 6 | Component lifecycle, state management, HMR |
| **Styling** | Tailwind CSS v4, Vanilla CSS | Design tokens, glassmorphic panels |
| **Math Engine** | Rust → WebAssembly via `wasm-pack` | Cholesky decomposition, Higham nearest-PD, covariance algebra |
| **Linear Algebra** | `nalgebra 0.33` | f64 precision internally, f32 output for GPU |
| **WASM Bridge** | `wasm-bindgen`, `js-sys` | Zero-copy `Float32Array` ↔ `&[f32]` slices |
| **GPU Compute** | WebGPU + WGSL | 100K-thread parallel Monte Carlo simulation |
| **GPU Render** | WebGPU + WGSL | Instanced quad rendering, additive blending |
| **PRNG** | PCG32 (PCG-XSH-RR) | Per-particle deterministic random state |
| **Normal Generation** | Box-Muller Transform | Pairs of uniforms → standard normals |
| **Asset Model** | Merton Jump-Diffusion | GBM + compound Poisson jumps |

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | ≥ 18 | [nodejs.org](https://nodejs.org/) |
| **Rust** | stable | [rustup.rs](https://rustup.rs/) |
| **wasm-pack** | ≥ 0.12 | `cargo install wasm-pack` |
| **wasm32 target** | — | `rustup target add wasm32-unknown-unknown` |
| **WebGPU browser** | Chrome 113+, Edge 113+, Firefox Nightly | [caniuse.com/webgpu](https://caniuse.com/webgpu) |

---

## Getting Started

```powershell
# 1. Clone the repository
git clone https://github.com/your-username/mssim.git
cd mssim

# 2. Install Node dependencies
npm install

# 3. Build the Rust/WASM math engine
npm run build:wasm
# ↳ Runs: wasm-pack build crates/engine --target web --out-dir ../../src/wasm/engine

# 4. Run Rust unit tests (optional)
cd crates/engine && cargo test && cd ../..

# 5. Start the dev server
npm run dev
# ↳ Opens at http://localhost:5173/

# 6. Production build (optional)
npm run build
npm run preview
```

> **Note:** The WASM build must complete before starting the dev server. The compiled WASM output is gitignored — you must build it locally.

---

## Project Structure

```
mssim/
├── crates/engine/                  # Rust WASM crate (54 KB compiled)
│   ├── Cargo.toml                  # nalgebra 0.33, wasm-bindgen 0.2
│   └── src/
│       ├── lib.rs                  # Module re-exports
│       ├── math.rs                 # 6 math functions + 7 unit tests
│       └── engine.rs               # #[wasm_bindgen] compute_shock() API
│
├── src/
│   ├── wasm/engine/                # wasm-pack output (gitignored)
│   │
│   ├── shaders/
│   │   ├── simulate.wgsl           # Compute shader: PCG32, Box-Muller, Merton JD
│   │   └── render.wgsl             # Render shader: instanced quads, color mapping
│   │
│   ├── data/
│   │   ├── portfolio.ts            # Default 3-asset portfolio (60/30/10)
│   │   └── shocks.ts               # Rate Hike, Black Swan, Stagflation presets
│   │
│   ├── components/
│   │   ├── PresetBar.tsx            # Shock preset buttons + descriptions
│   │   ├── StatsPanel.tsx           # Distribution statistics overlay
│   │   └── PerfHUD.tsx              # Performance metrics overlay
│   │
│   ├── types.ts                    # Portfolio, MacroShock, EngineOutput interfaces
│   ├── engine.ts                   # WASM wrapper + JS fallback engine
│   ├── gpu.ts                      # WebGPU initialization + error handling
│   ├── compute.ts                  # GPU compute pipeline + readback
│   ├── renderer.ts                 # GPU render pipeline + additive blending
│   ├── stats.ts                    # Distribution statistics (VaR, CVaR, etc.)
│   ├── App.tsx                     # Main app: render loop, resize, reactivity
│   ├── main.tsx                    # React entry point
│   └── index.css                   # Dark theme, glassmorphic UI, animations
│
├── build-wasm.ps1                  # PowerShell WASM build script
├── vite.config.ts                  # Vite + React + Tailwind + WASM plugins
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
└── index.html                      # HTML entry with viewport meta + fonts
```

---

## Pipeline Deep Dive

### Stage 1 — Rust/WASM Math Engine

The JavaScript frontend sends a `Portfolio` and a `MacroShock` to the Rust engine via `Float32Array` slices (zero-copy through `wasm-bindgen`).

**Operations performed in Rust:**

```
Portfolio + MacroShock
    │
    ├─► adjust_drift()        μ_new = μ_base + Δμ
    ├─► adjust_vol()          σ_new = σ_base × multiplier
    ├─► blend_correlation()   R_new = (1-s)·R_base + s·J  (J = all-ones matrix)
    ├─► nearest_pd()          Higham alternating projections → guaranteed PD
    ├─► rebuild_covariance()  Σ = D · R · D  (D = diag(σ))
    └─► cholesky_decompose()  L·Lᵀ = Σ → lower-triangular L
    │
    ▼
EngineOutput {
    adjustedDrift:  Float32Array[N]
    adjustedVol:    Float32Array[N]
    choleskyL:      Float32Array[N×N]
    jumpLambda, jumpMean, jumpVol
}
```

**Why Rust?** `nalgebra` provides numerically stable f64 linear algebra. The Higham nearest-PD projection requires iterative eigenvalue decomposition — pure JavaScript would be fragile and slow. The compiled WASM binary is only 54 KB.

**JS Fallback:** If WASM isn't loaded, `engine.ts` provides a simplified JavaScript fallback that applies basic drift/vol adjustments (no Cholesky, no nearest-PD). This allows the UI to function during development without a WASM build.

---

### Stage 2 — WebGPU Compute Shader

A single WGSL compute shader (`simulate.wgsl`) runs 100,000 parallel threads at `@workgroup_size(256)`.

**Per-thread algorithm:**

1. **PCG32 PRNG** — PCG-XSH-RR variant seeded with `global_invocation_id ^ uniform_seed`. Produces uniform `[0, 1)` floats.

2. **Box-Muller Transform** — Converts pairs of uniform random numbers into standard normal variates: `Z = √(-2·ln(U₁)) · cos(2π·U₂)`

3. **Cholesky Correlation** — Matrix-vector multiply `X = L · Z` transforms independent normals into correlated asset returns. Supports up to N=16 assets (unrolled loop).

4. **Merton Jump-Diffusion** — For each asset:
   ```
   R_i = (μ_i - σ_i²/2)·dt + σ_i·√dt·X_i + J_i
   ```
   Where `J_i` is sampled from a compound Poisson process: `J ~ Poisson(λ·dt) × N(μ_J, σ_J²)`

5. **Portfolio Aggregation** — `R_portfolio = Σ(w_i · R_i)` weighted sum of asset returns.

6. **Position Output** — `positions[idx] = vec2(x, y)` where `x` is the normalized particle index with jitter and `y` is the raw portfolio return.

**GPU Buffer Layout:**

| Buffer | Type | Size | Content |
|--------|------|------|---------|
| `params` | Uniform | 32B | SimParams: numAssets, numParticles, dt, jumpLambda, jumpMean, jumpVol, seed |
| `drift` | Storage | 64B | Adjusted drift μ from WASM (max 16 assets) |
| `vol` | Storage | 64B | Adjusted volatility σ from WASM |
| `cholesky` | Storage | 1024B | Lower-triangular L matrix (max 16×16) |
| `weights` | Storage | 64B | Portfolio weights |
| `positions` | Storage | 800KB | Output: `vec2<f32>` × 100K particles |

---

### Stage 3 — Render Pipeline

Each particle is rendered as an **instanced billboard quad** (6 vertices / 2 triangles per particle) rather than WebGPU's `point-list` topology, which caps point sizes at 1px on most implementations.

**Vertex Shader:**
- Reads positions from storage buffer (shared with compute output — zero copies)
- Generates quad corners from `vertex_index % 6` — no vertex buffer needed
- Transforms compute space `(x, y)` → NDC with configurable `y_scale` and `aspect` correction
- Passes raw `portfolio_return` to fragment shader as a varying

**Fragment Shader:**
- **Radial glow:** `smoothstep(1.0, 0.0, distance)` for soft circular particles
- **Color mapping by return value:**
  - `return > -10%` → **Bioluminescent cyan** `rgb(0, 0.85, 1.0)`
  - `-30% < return < -10%` → **Interpolated cyan → orange**
  - `return < -30%` → **Tail-risk red** `rgb(1.0, 0.15, 0.05)`
- **Premultiplied alpha** for correct additive blending

**Blending:**
```
srcFactor: 'one'
dstFactor: 'one'
operation: 'add'
```
This creates a natural density visualization — overlapping particles accumulate brightness without any histogram computation.

**Canvas:**
- `GPUCanvasContext` with `premultiplied` alpha mode
- `ResizeObserver` for DPR-aware sizing (retina displays)
- Aspect ratio uniforms updated on every resize

---

### Stage 4 — UI & Analytics

**StatsPanel** (top-right glassmorphic overlay):
- Mean Return, Std Dev, Skewness
- VaR 95% (5th percentile), CVaR 95% (mean of returns below VaR)
- Min, Max returns
- Tail % (particles below -30%, matching shader's tail-risk threshold)
- Danger values highlighted in orange

**PerfHUD** (header):
- Particle count
- Compute shader dispatch time
- Render time
- GPU adapter name

**PresetBar** (bottom):
- Three macro-shock scenario buttons with glassmorphic styling
- Active state with cyan glow and gradient border
- Shock narrative description below buttons
- Parameter tooltip on hover (λ, μ_J, σ_J, ρ)

**Reactivity Flow:**
```
PresetBar click
    → runEngine(portfolio, shock)      [WASM — sync]
    → dispatchSimulation(compute)      [GPU compute — sync]
    → renderFrame(render)              [GPU render — sync]
    → setHasSimulated(true)            [React state]
    → readbackPositions(compute)       [GPU readback — async]
    → computeStats(positions)          [CPU — sync]
    → setStats(stats)                  [React state → StatsPanel re-render]
```

---

## Shock Presets

| Parameter | Rate Hike | Black Swan | Stagflation |
|-----------|-----------|------------|-------------|
| **Narrative** | Fed +200bp | Systemic crisis | Stagnant growth + inflation |
| `deltaDrift` | `[-0.02, 0.01, -0.01]` | `[-0.15, 0.05, -0.08]` | `[-0.06, -0.02, 0.04]` |
| `volMultiplier` | `[1.3, 1.1, 1.2]` | `[3.0, 1.8, 2.5]` | `[1.8, 1.4, 2.0]` |
| `correlationSkew` | `0.3` | `0.85` | `0.55` |
| `jumpLambda` | `0.5` | `4.0` | `1.5` |
| `jumpMean` | `-0.02` | `-0.12` | `-0.05` |
| `jumpVol` | `0.03` | `0.08` | `0.06` |

### Default Portfolio

| Asset | Weight | Base Drift (μ) | Base Vol (σ) |
|-------|--------|----------------|--------------|
| Equities | 60% | 8% | 18% |
| Bonds | 30% | 3% | 6% |
| Commodities | 10% | 5% | 22% |

Base correlation matrix:
```
         Eq    Bd    Cm
Eq    [ 1.0,  0.2,  0.3 ]
Bd    [ 0.2,  1.0, -0.1 ]
Cm    [ 0.3, -0.1,  1.0 ]
```

---

## Distribution Statistics

Statistics are computed on the CPU from an async GPU readback of the position buffer.

| Metric | Formula | Description |
|--------|---------|-------------|
| **Mean** | `Σ(rᵢ) / N` | Average portfolio return |
| **Std Dev** | `√(Σ(rᵢ - μ)² / N)` | Dispersion of returns |
| **Skewness** | `(Σ(rᵢ - μ)³ / N) / σ³` | Asymmetry (negative = left-tailed) |
| **VaR 95%** | `sorted[0.05 × N]` | 5th percentile return (worst 1-in-20 outcome) |
| **CVaR 95%** | `mean(rᵢ where rᵢ ≤ VaR)` | Expected shortfall — average loss in the worst 5% |
| **Min / Max** | `min(rᵢ)`, `max(rᵢ)` | Extreme return bounds |
| **Tail %** | `count(rᵢ < -0.30) / N` | Percentage of particles in the tail-risk zone |

### Typical Values by Preset

| Metric | Rate Hike | Black Swan | Stagflation |
|--------|-----------|------------|-------------|
| Mean | ~+23% | ~+66% | ~+39% |
| Std Dev | ~11% | ~57% | ~24% |
| VaR 95% | ~-1% | ~-65% | ~-15% |
| CVaR 95% | ~-8% | ~-96% | ~-30% |
| Tail < -30% | 0.0% | ~8.0% | ~0.5% |

---

## Design Decisions

### Why Rust/WASM for the Math Engine?
The Higham nearest-PD algorithm requires iterative eigenvalue decomposition of the correlation matrix. JavaScript's numerical precision (64-bit IEEE 754) is sufficient, but `nalgebra` in Rust provides battle-tested linear algebra with compile-time matrix dimensionality checks. The 54 KB WASM binary is negligible.

### Why WebGPU Instead of WebGL?
WebGPU provides compute shaders — there is no equivalent in WebGL. The entire Monte Carlo simulation runs natively on the GPU without CPU round-trips. WebGL would require encoding the simulation as a series of texture render passes (ping-pong FBOs), which is fragile and much slower.

### Why Instanced Quads Instead of Point Sprites?
WebGPU's `point-list` topology is capped at 1px on many implementations. Instanced quads (6 vertices per particle, generated procedurally from `vertex_index`) give full control over particle size, shape, and glow falloff.

### Why Additive Blending?
Additive blending (`one + one`) naturally creates density-proportional brightness. Dense regions of the return distribution glow brighter without computing histograms or KDEs. It's the GPU equivalent of a heat map — for free.

### Why PCG32 Instead of xorshift128?
PCG32 has better statistical properties for Monte Carlo simulation: full 2³² period, excellent equidistribution, and passes all TestU01 BigCrush tests. Each GPU thread seeds its PCG state from `global_invocation_id XOR uniform_seed`, ensuring independent streams without correlation artifacts.

### Why Separate Correlation + Vol Instead of Direct Covariance?
Providing `baseCorrelation` and `baseVol` separately prevents internal inconsistency. A user-specified covariance matrix may have eigenvalues inconsistent with the specified volatilities. By constructing Σ = D·R·D explicitly, we guarantee consistency.

---

## Performance

Measured on Intel integrated GPU, 100,000 particles:

| Operation | Typical Time |
|-----------|-------------|
| WASM engine (Cholesky + PD) | < 1ms |
| GPU compute dispatch | ~0.1ms |
| GPU render (100K instanced quads) | ~0.2ms |
| Async readback + CPU stats | ~2ms |
| **Total end-to-end** | **< 4ms** |

The rendering is not frame-rate limited — it renders once per dispatch (on-demand), not in a continuous loop. This keeps GPU utilization near zero when idle.

---

## Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| **Chrome 113+** | ✅ Full support | WebGPU enabled by default |
| **Edge 113+** | ✅ Full support | Chromium-based, same as Chrome |
| **Firefox Nightly** | ⚠️ Experimental | Enable `dom.webgpu.enabled` in about:config |
| **Safari 18+** | ⚠️ Preview | WebGPU in Technology Preview |
| **Other browsers** | ❌ Not supported | Falls back to "WebGPU Unavailable" message |

---

## Development

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Serve production build locally |
| `npm run build:wasm` | Compile Rust → WASM (required before first run) |

### Rust Tests

```bash
cd crates/engine
cargo test
```

7 unit tests covering:
- `adjust_drift` — additive drift adjustment
- `adjust_vol` — multiplicative vol scaling
- `blend_correlation` — skew blending toward J
- `nearest_pd` — Higham positive-definiteness projection
- `rebuild_covariance` — Σ = D·R·D reconstruction
- `cholesky_decompose` — L·Lᵀ factorization
- `compute_shock` — full end-to-end pipeline

### Vite Configuration

```typescript
// vite.config.ts
plugins: [
    react(),          // React Fast Refresh
    tailwindcss(),    // Tailwind CSS v4 (Vite plugin)
    wasm(),           // WASM import support
    topLevelAwait(),  // top-level await for WASM init
]
```

### Adding a New Shock Preset

1. Add the shock definition to `src/data/shocks.ts`:
```typescript
my_shock: {
    id: 'my_shock',
    name: 'My Shock',
    deltaDrift: [/* per-asset drift adjustments */],
    volMultiplier: [/* per-asset vol multipliers */],
    correlationSkew: 0.5,  // 0 = no change, 1 = full correlation
    jumpLambda: 2.0,       // Poisson intensity (jumps/year)
    jumpMean: -0.08,       // Mean log-jump size
    jumpVol: 0.05,         // Jump volatility
},
```

2. Add a description to `src/components/PresetBar.tsx`:
```typescript
my_shock: 'Your narrative description of the macroeconomic scenario.',
```

3. Save. Vite HMR will pick it up.

### Changing the Portfolio

Edit `src/data/portfolio.ts`. The engine auto-scales to any number of assets as long as:
- `weights.length === assets.length`
- `baseCorrelation.length === assets.length²` (flattened row-major)
- Shock arrays match the asset count

---

## License

MIT
