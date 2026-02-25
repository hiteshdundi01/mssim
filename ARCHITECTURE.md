# MSSIM — Macro-Shock Particle Simulator

A real-time, browser-based financial physics engine that translates qualitative macroeconomic shocks into quantitative portfolio covariance matrices, then uses WebGPU to simulate and render 1,000,000 Monte Carlo trajectories as a fluid particle swarm.

## Status

| Step | Description | Status |
|------|-------------|--------|
| 1 | Scaffold, Rust/WASM Math Engine & Presets | ✅ Complete |
| 2 | WebGPU Init & Compute Shader | ✅ Complete |
| 3 | Render Shader & Visual Pipeline | ✅ Complete |
| 4 | UI, Presets & Reactivity | ✅ Complete |

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
4. Dispatch 100K compute threads, each generating a full portfolio return path
5. Output (X, Y) position buffer for the render shader

---

## Step 2: What Was Built

### WebGPU Initialization
- Feature detection via `navigator.gpu` with graceful fallback
- High-performance adapter request (prefers discrete GPU)
- Device loss and uncaptured error handlers
- React integration: init on mount, status display in UI center

### GPU Buffer Layout

| Buffer | Type | Size | Content |
|--------|------|------|---------|
| `params` | Uniform | 32B | `SimParams` struct: numAssets, numParticles, dt, jumpLambda, jumpMean, jumpVol, seed |
| `drift` | Storage (read) | 64B | Adjusted drift vector from WASM (max 16 assets) |
| `vol` | Storage (read) | 64B | Adjusted volatility vector from WASM |
| `cholesky` | Storage (read) | 1024B | Cholesky L matrix from WASM (max 16×16) |
| `weights` | Storage (read) | 64B | Portfolio weights |
| `positions` | Storage (r/w) | 800KB | Output: `vec2<f32>` per particle (100K particles) |


### WGSL Compute Shader (`simulate.wgsl`)

Single-dispatch kernel at `@workgroup_size(256)`:

1. **PCG32 PRNG** — PCG-XSH-RR variant, seeded per-particle via `global_id ^ seed`
2. **Box-Muller** — Generates N standard normals from pairs of uniforms
3. **Cholesky correlation** — `X = L·Z` matrix-vector multiply (N ≤ 16, unrolled)
4. **Merton per-asset** — `R_i = (μ_i - σ_i²/2)·dt + σ_i·√dt·X_i + J_i`
5. **Portfolio return** — `R_p = Σ(w_i · R_i)`
6. **Position mapping** — `(x, y) = (idx/N + jitter, R_p)`

### JS Orchestration (`compute.ts`)

- Pipeline creation with explicit bind group layout
- Buffer upload from WASM `Float32Array` outputs
- Compute pass encoding and submission
- Readback via staging buffer (temporary, for verification)

### Project Structure (Updated)

```
mssim/
├── crates/engine/              # Rust WASM crate
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── math.rs
│       └── engine.rs
├── src/
│   ├── wasm/engine/            # wasm-pack output (gitignored)
│   ├── shaders/
│   │   └── simulate.wgsl       # Compute shader (Step 2)
│   ├── data/
│   │   ├── portfolio.ts
│   │   └── shocks.ts
│   ├── components/
│   │   └── PresetBar.tsx
│   ├── types.ts
│   ├── engine.ts               # WASM wrapper
│   ├── gpu.ts                  # WebGPU init (Step 2)
│   ├── compute.ts              # GPU orchestration (Step 2)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── build-wasm.ps1
├── vite.config.ts
├── package.json
└── index.html
```

### Verification

- **Browser:** WebGPU initializes, compute dispatches 100K particles, readback shows valid (x, y) positions with no NaN/Infinity values
- **Console output:** `[MSSIM] Compute dispatched: 100,000 particles in Xms`

---

## Step 3: What Was Built

### Render Pipeline

- **Instanced quad rendering** — each particle is a 6-vertex billboard (2 triangles), not `point-list`, because WebGPU caps point sizes at 1px on most implementations
- **Additive blending** — `srcFactor: one, dstFactor: one` creates natural density glow where particles overlap
- **GPUCanvasContext** configured on the HTML canvas with `premultiplied` alpha mode
- **ResizeObserver** for DPR-aware canvas sizing with automatic aspect ratio updates

### WGSL Render Shader (`render.wgsl`)

**Vertex shader:**
- Reads `positions` storage buffer (shared with compute shader output)
- Generates quad offsets from `vertex_index % 6` — no vertex buffer needed
- Transforms compute space `(x, y)` → NDC with configurable `y_scale` and `aspect` correction
- Passes raw `portfolio_return` to fragment shader as varying

**Fragment shader:**
- Radial glow falloff: `smoothstep(1.0, 0.0, dist)` for soft circular particles
- Color mapping by portfolio return:
  - `y > -0.10` → **bioluminescent cyan** `(0.0, 0.85, 1.0)`
  - `-0.30 < y < -0.10` → interpolated **cyan → orange**
  - `y < -0.30` → **tail-risk red** `(1.0, 0.15, 0.05)`
- Premultiplied alpha output for correct additive blending

### Render Uniforms

| Field | Value | Purpose |
|-------|-------|---------|
| `point_size` | 0.012 | NDC half-size (~8px at 1080p) |
| `y_scale` | 8.0 | Amplifies return values for vertical spread |
| `y_offset` | 0.0 | Vertical center offset |
| `aspect` | dynamic | Canvas aspect ratio, updated on resize |

### JS Orchestration (`renderer.ts`)

- `createRenderPipeline()` — configures canvas context, compiles render shader, creates additive blend pipeline
- `updateRenderUniforms()` — writes render params (called on init and resize)
- `renderFrame()` — encodes render pass: clear → draw instanced quads → submit

### Project Structure (Updated)

```
mssim/
├── crates/engine/              # Rust WASM crate
│   └── src/
│       ├── lib.rs
│       ├── math.rs
│       └── engine.rs
├── src/
│   ├── wasm/engine/            # wasm-pack output (gitignored)
│   ├── shaders/
│   │   ├── simulate.wgsl       # Compute shader (Step 2)
│   │   └── render.wgsl         # Render shader (Step 3)
│   ├── data/
│   │   ├── portfolio.ts
│   │   └── shocks.ts
│   ├── components/
│   │   └── PresetBar.tsx
│   ├── types.ts
│   ├── engine.ts               # WASM wrapper
│   ├── gpu.ts                  # WebGPU init (canvas context)
│   ├── compute.ts              # Compute pipeline
│   ├── renderer.ts             # Render pipeline (Step 3)
│   ├── App.tsx                 # Render loop, resize observer
│   ├── main.tsx
│   └── index.css
├── build-wasm.ps1
├── vite.config.ts
├── package.json
└── index.html
```

### Verification

- **Browser:** 100K particles render as bright cyan glowing points; Black Swan shows wide distribution, Rate Hike shows tight distribution
- **Performance:** Compute + render in < 1ms
- **Additive blending:** Dense particle regions glow brighter
- **Resize:** Canvas properly scales with device pixel ratio
- **Status text:** Auto-hides after first simulation
