# MSSIM — Macro-Shock Particle Simulator

A real-time, browser-based financial physics engine that translates qualitative macroeconomic shocks into quantitative portfolio covariance matrices, then uses WebGPU to simulate and render 1,000,000 Monte Carlo trajectories as a fluid particle swarm.

## Status

| Step | Description | Status |
|------|-------------|--------|
| 1 | Scaffold, Rust/WASM Math Engine & Presets | ✅ Complete |
| 2 | WebGPU Init & Compute Shader | ⬜ Pending |
| 3 | Render Shader & Visual Pipeline | ⬜ Pending |
| 4 | UI, Presets & Reactivity | ⬜ Pending |

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
│              │  │ Compute     │ │  ← 1M parallel threads    │
│              │  │ Shader      │ │    PCG32 + Box-Muller     │
│              │  │ (WGSL)      │ │    Merton jump-diffusion  │
│              │  └──────┬──────┘ │                           │
│              │         │        │                           │
│              │  ┌──────▼──────┐ │                           │
│              │  │ Render      │ │  ← Additive blending      │
│              │  │ Shader      │ │    Bioluminescent colors   │
│              │  │ (WGSL)      │ │    Tail-risk red/orange    │
│              │  └─────────────┘ │                           │
│              └──────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: What Was Built

### Tech Stack
- **Frontend:** Vite 6 + React 19 + TypeScript + Tailwind CSS v4
- **Math Engine:** Rust → WebAssembly via `wasm-pack` (54 KB binary)
- **Linear Algebra:** `nalgebra 0.33` (f64 precision internally, f32 output for GPU)
- **WASM Interface:** Raw `Float32Array` slices — no serde overhead

### Data Flow

```
Portfolio + MacroShock (TS objects)
        │
        ▼
   engine.ts marshals to Float32Array
        │
        ▼
   compute_shock() in Rust/WASM
        │
        ├─► adjust_drift:       μ_new = μ_base + Δμ
        ├─► adjust_vol:         σ_new = σ_base × multiplier
        ├─► blend_correlation:  R_new = (1-s)·R + s·J
        ├─► nearest_pd:         Higham alternating projections
        ├─► rebuild_covariance: Σ = D·R·D
        └─► cholesky_decompose: LL^T = Σ
        │
        ▼
   EngineResult {
     adjustedDrift:  Float32Array[N],
     adjustedVol:    Float32Array[N],
     choleskyL:      Float32Array[N×N],
     jumpLambda, jumpMean, jumpVol
   }
```

### Key Design Decisions

1. **`baseCorrelation` instead of `baseCovariance`** — the original spec provided both vol and covariance, which can be inconsistent. We provide vol + correlation and reconstruct Σ in Rust.

2. **Higham nearest-PD projection** — blending a correlation matrix toward all-ones can break positive-definiteness. Higham's alternating projections algorithm guarantees Cholesky never fails.

3. **Full Merton jump-diffusion** — `MacroShock` includes `jumpLambda` (Poisson intensity), `jumpMean` (μ_J), and `jumpVol` (σ_J) for the complete J ~ N(μ_J, σ_J²) parameterization.

4. **Raw Float32Array WASM interface** — `wasm-bindgen` converts JS `Float32Array` to Rust `&[f32]` slices with zero-copy. No serde serialization overhead.

5. **JS fallback engine** — `engine.ts` auto-detects WASM availability. If not loaded, a JS fallback computes basic drift/vol adjustments so the UI works during development.

### Project Structure

```
mssim/
├── crates/engine/              # Rust WASM crate
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs              # Module re-exports
│       ├── math.rs             # 6 math functions + 7 unit tests
│       └── engine.rs           # #[wasm_bindgen] API
├── src/
│   ├── wasm/engine/            # wasm-pack output (gitignored)
│   ├── data/
│   │   ├── portfolio.ts        # Default 3-asset portfolio
│   │   └── shocks.ts           # Rate Hike, Black Swan, Stagflation
│   ├── components/
│   │   └── PresetBar.tsx       # Shock preset buttons
│   ├── types.ts                # Portfolio, MacroShock, EngineOutput
│   ├── engine.ts               # WASM wrapper + JS fallback
│   ├── App.tsx                 # Full-viewport dark shell
│   ├── main.tsx                # React entry
│   └── index.css               # Dark theme, glassmorphic UI
├── build-wasm.ps1              # WASM build script
├── vite.config.ts
├── package.json
└── index.html
```

### Shock Presets

| Parameter | Rate Hike | Black Swan | Stagflation |
|---|---|---|---|
| `deltaDrift` | `[-0.02, 0.01, -0.01]` | `[-0.15, 0.05, -0.08]` | `[-0.06, -0.02, 0.04]` |
| `volMultiplier` | `[1.3, 1.1, 1.2]` | `[3.0, 1.8, 2.5]` | `[1.8, 1.4, 2.0]` |
| `correlationSkew` | `0.3` | `0.85` | `0.55` |
| `jumpLambda` | `0.5` | `4.0` | `1.5` |
| `jumpMean` | `-0.02` | `-0.12` | `-0.05` |
| `jumpVol` | `0.03` | `0.08` | `0.06` |

### Verification

- **Rust tests:** 7/7 pass (`cargo test` in `crates/engine/`)
- **Browser test:** WASM loads, all 3 presets produce `L[9] μ[3] σ[3]` output

### Build Commands

```powershell
# Install dependencies
npm install

# Build WASM (requires wasm-pack + wasm32-unknown-unknown target)
npm run build:wasm

# Run Rust tests
cd crates/engine && cargo test

# Dev server
npm run dev
```

---

## Next: Step 2 — WebGPU Compute Shader

The Cholesky matrix L, adjusted drift, and adjusted vol are ready as `Float32Array` buffers. Step 2 will:

1. Initialize WebGPU device/adapter in React
2. Upload L, μ, σ, and jump params to GPU uniform buffers
3. Write a WGSL compute shader implementing:
   - PCG32 PRNG (per-particle state)
   - Box-Muller transform (N(0,1) generation)
   - Cholesky correlation (X = L·Z)
   - Merton jump-diffusion path generation
4. Dispatch 1M compute threads, each generating a full portfolio return path
5. Output (X, Y) position buffer for the render shader
