use wasm_bindgen::prelude::*;
use js_sys::Float32Array;
use nalgebra::{DMatrix, DVector};

use crate::math;

// ════════════════════════════════════════════════════════════════
// EngineResult — returned to JS with zero-copy Float32Array views
// ════════════════════════════════════════════════════════════════
#[wasm_bindgen]
pub struct EngineResult {
    adjusted_drift: Vec<f32>,
    adjusted_vol: Vec<f32>,
    cholesky_l: Vec<f32>,
    num_assets: usize,
    jump_lambda: f32,
    jump_mean: f32,
    jump_vol: f32,
}

#[wasm_bindgen]
impl EngineResult {
    #[wasm_bindgen(getter)]
    pub fn adjusted_drift(&self) -> Float32Array {
        Float32Array::from(self.adjusted_drift.as_slice())
    }

    #[wasm_bindgen(getter)]
    pub fn adjusted_vol(&self) -> Float32Array {
        Float32Array::from(self.adjusted_vol.as_slice())
    }

    #[wasm_bindgen(getter)]
    pub fn cholesky_l(&self) -> Float32Array {
        Float32Array::from(self.cholesky_l.as_slice())
    }

    #[wasm_bindgen(getter)]
    pub fn num_assets(&self) -> usize {
        self.num_assets
    }

    #[wasm_bindgen(getter)]
    pub fn jump_lambda(&self) -> f32 {
        self.jump_lambda
    }

    #[wasm_bindgen(getter)]
    pub fn jump_mean(&self) -> f32 {
        self.jump_mean
    }

    #[wasm_bindgen(getter)]
    pub fn jump_vol(&self) -> f32 {
        self.jump_vol
    }
}

// ════════════════════════════════════════════════════════════════
// compute_shock — main entry point called from JS
// ════════════════════════════════════════════════════════════════
#[wasm_bindgen]
pub fn compute_shock(
    num_assets: usize,
    base_drift: &[f32],
    base_vol: &[f32],
    base_correlation: &[f32],
    delta_drift: &[f32],
    vol_multiplier: &[f32],
    correlation_skew: f32,
    jump_lambda: f32,
    jump_mean: f32,
    jump_vol: f32,
) -> Result<EngineResult, JsValue> {
    let n = num_assets;

    // ── Validate input lengths ──────────────────────────────────
    if base_drift.len() != n
        || base_vol.len() != n
        || base_correlation.len() != n * n
        || delta_drift.len() != n
        || vol_multiplier.len() != n
    {
        return Err(JsValue::from_str(&format!(
            "Input length mismatch: expected N={}, got drift={}, vol={}, corr={}, dd={}, vm={}",
            n,
            base_drift.len(),
            base_vol.len(),
            base_correlation.len(),
            delta_drift.len(),
            vol_multiplier.len(),
        )));
    }

    // ── Convert f32 → f64 for nalgebra precision ────────────────
    let bd: Vec<f64> = base_drift.iter().map(|&x| x as f64).collect();
    let bv: Vec<f64> = base_vol.iter().map(|&x| x as f64).collect();
    let bc: Vec<f64> = base_correlation.iter().map(|&x| x as f64).collect();
    let dd: Vec<f64> = delta_drift.iter().map(|&x| x as f64).collect();
    let vm: Vec<f64> = vol_multiplier.iter().map(|&x| x as f64).collect();

    let base_drift_v = DVector::from_vec(bd);
    let base_vol_v = DVector::from_vec(bv);
    let base_corr_m = DMatrix::from_row_slice(n, n, &bc);
    let delta_drift_v = DVector::from_vec(dd);
    let vol_mult_v = DVector::from_vec(vm);

    // ── Run the math pipeline ───────────────────────────────────
    // Step 1: Adjust drift
    let adj_drift = math::adjust_drift(&base_drift_v, &delta_drift_v);

    // Step 2: Adjust volatility
    let adj_vol = math::adjust_vol(&base_vol_v, &vol_mult_v);

    // Step 3: Blend correlation toward crisis mode
    let blended = math::blend_correlation(&base_corr_m, correlation_skew as f64);

    // Step 4: Project to nearest positive-definite (Higham)
    let pd = math::nearest_pd(&blended);

    // Step 5: Rebuild covariance Σ = D·R·D
    let cov = math::rebuild_covariance(&adj_vol, &pd);

    // Step 6: Cholesky decomposition
    let l = math::cholesky_decompose(&cov)
        .map_err(|e| JsValue::from_str(e))?;

    // ── Pack results as flattened f32 arrays ─────────────────────
    let adj_drift_f32: Vec<f32> = adj_drift.iter().map(|&x| x as f32).collect();
    let adj_vol_f32: Vec<f32> = adj_vol.iter().map(|&x| x as f32).collect();

    // Flatten L in row-major for GPU uniform upload
    let mut cholesky_f32 = Vec::with_capacity(n * n);
    for i in 0..n {
        for j in 0..n {
            cholesky_f32.push(l[(i, j)] as f32);
        }
    }

    Ok(EngineResult {
        adjusted_drift: adj_drift_f32,
        adjusted_vol: adj_vol_f32,
        cholesky_l: cholesky_f32,
        num_assets: n,
        jump_lambda,
        jump_mean,
        jump_vol,
    })
}
