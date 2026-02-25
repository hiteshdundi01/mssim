use nalgebra::{DMatrix, DVector};

// ────────────────────────────────────────────────────────────────
// Phase A — Step 1: adjust_drift
// μ_new = μ_base + Δμ
// ────────────────────────────────────────────────────────────────
pub fn adjust_drift(base: &DVector<f64>, delta: &DVector<f64>) -> DVector<f64> {
    base + delta
}

// ────────────────────────────────────────────────────────────────
// Phase A — Step 2: adjust_vol
// σ_new = σ_base × multiplier  (element-wise)
// ────────────────────────────────────────────────────────────────
pub fn adjust_vol(base: &DVector<f64>, multiplier: &DVector<f64>) -> DVector<f64> {
    base.component_mul(multiplier)
}

// ────────────────────────────────────────────────────────────────
// Phase A — Step 3: blend_correlation
// R_new = (1 - skew) * R_base + skew * J   (J = all-ones matrix)
// ────────────────────────────────────────────────────────────────
pub fn blend_correlation(r_base: &DMatrix<f64>, skew: f64) -> DMatrix<f64> {
    let n = r_base.nrows();
    let ones = DMatrix::from_element(n, n, 1.0);
    r_base * (1.0 - skew) + ones * skew
}

// ────────────────────────────────────────────────────────────────
// Phase A — Step 4: nearest_pd  (Higham's alternating projections)
// Guarantees the blended correlation matrix is positive-definite.
// ────────────────────────────────────────────────────────────────
pub fn nearest_pd(mat: &DMatrix<f64>) -> DMatrix<f64> {
    let n = mat.nrows();
    let max_iter = 100;
    let eps = 1e-10;

    // Symmetrize
    let mut y = (mat + mat.transpose()) * 0.5;
    let mut ds = DMatrix::zeros(n, n);

    for _ in 0..max_iter {
        let r = &y - &ds;

        // Project onto S+ (positive semidefinite cone)
        let eigen = r.clone().symmetric_eigen();
        let mut vals = eigen.eigenvalues.clone();
        for v in vals.iter_mut() {
            if *v < eps {
                *v = eps;
            }
        }
        let x_pos = &eigen.eigenvectors
            * DMatrix::from_diagonal(&vals)
            * eigen.eigenvectors.transpose();

        ds = &x_pos - &r;

        // Project onto U (unit diagonal)
        y = x_pos.clone();
        for i in 0..n {
            y[(i, i)] = 1.0;
        }

        // Check convergence
        let diff = (&y - &x_pos).norm();
        if diff < eps * 10.0 {
            break;
        }
    }

    // Final symmetrize + enforce unit diagonal
    let result = (&y + y.transpose()) * 0.5;
    let mut out = result;
    for i in 0..n {
        out[(i, i)] = 1.0;
    }
    out
}

// ────────────────────────────────────────────────────────────────
// Phase A — Step 5: rebuild_covariance
// Σ = D · R · D   where D = diag(σ_new)
// ────────────────────────────────────────────────────────────────
pub fn rebuild_covariance(sigma: &DVector<f64>, r: &DMatrix<f64>) -> DMatrix<f64> {
    let d = DMatrix::from_diagonal(sigma);
    &d * r * &d
}

// ────────────────────────────────────────────────────────────────
// Phase A — Step 6: cholesky_decompose
// LL^T = Σ  →  returns lower-triangular L
// ────────────────────────────────────────────────────────────────
pub fn cholesky_decompose(sigma: &DMatrix<f64>) -> Result<DMatrix<f64>, &'static str> {
    nalgebra::linalg::Cholesky::new(sigma.clone())
        .map(|chol| chol.l())
        .ok_or("Cholesky decomposition failed: matrix is not positive-definite")
}

// ════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn test_adjust_drift() {
        let base = DVector::from_vec(vec![0.08, 0.03]);
        let delta = DVector::from_vec(vec![-0.02, 0.01]);
        let result = adjust_drift(&base, &delta);
        assert_relative_eq!(result[0], 0.06, epsilon = 1e-10);
        assert_relative_eq!(result[1], 0.04, epsilon = 1e-10);
    }

    #[test]
    fn test_adjust_vol() {
        let base = DVector::from_vec(vec![0.18, 0.06]);
        let mult = DVector::from_vec(vec![1.3, 1.1]);
        let result = adjust_vol(&base, &mult);
        assert_relative_eq!(result[0], 0.234, epsilon = 1e-10);
        assert_relative_eq!(result[1], 0.066, epsilon = 1e-10);
    }

    #[test]
    fn test_blend_identity() {
        let r = DMatrix::from_row_slice(3, 3, &[
            1.0,  0.2,  0.3,
            0.2,  1.0, -0.1,
            0.3, -0.1,  1.0,
        ]);
        let result = blend_correlation(&r, 0.0);
        assert_relative_eq!(result, r, epsilon = 1e-10);
    }

    #[test]
    fn test_blend_full() {
        let r = DMatrix::from_row_slice(2, 2, &[
            1.0, 0.5,
            0.5, 1.0,
        ]);
        let result = blend_correlation(&r, 1.0);
        let expected = DMatrix::from_element(2, 2, 1.0);
        assert_relative_eq!(result, expected, epsilon = 1e-10);
    }

    #[test]
    fn test_nearest_pd() {
        // Create a matrix that is NOT positive-definite
        let bad = DMatrix::from_row_slice(3, 3, &[
            1.0, 0.9, 0.9,
            0.9, 1.0, 0.9,
            0.9, 0.9, 1.0,
        ]);
        let result = nearest_pd(&bad);

        // Check symmetry
        let result_t = result.transpose();
        assert_relative_eq!(result, result_t, epsilon = 1e-8);

        // Check all eigenvalues > 0
        let eigen = result.clone().symmetric_eigen();
        for v in eigen.eigenvalues.iter() {
            assert!(*v > 0.0, "eigenvalue {} should be positive", v);
        }

        // Check unit diagonal
        for i in 0..3 {
            assert_relative_eq!(result[(i, i)], 1.0, epsilon = 1e-8);
        }
    }

    #[test]
    fn test_cholesky_roundtrip() {
        let sigma = DVector::from_vec(vec![0.18, 0.06, 0.22]);
        let r = DMatrix::from_row_slice(3, 3, &[
            1.0,  0.2,  0.3,
            0.2,  1.0, -0.1,
            0.3, -0.1,  1.0,
        ]);
        let cov = rebuild_covariance(&sigma, &r);
        let l = cholesky_decompose(&cov).expect("Cholesky should succeed");
        let reconstructed = &l * l.transpose();
        assert_relative_eq!(reconstructed, cov, epsilon = 1e-6);
    }

    #[test]
    fn test_full_pipeline() {
        // Black Swan preset
        let base_drift = DVector::from_vec(vec![0.08, 0.03, 0.05]);
        let base_vol = DVector::from_vec(vec![0.18, 0.06, 0.22]);
        let base_corr = DMatrix::from_row_slice(3, 3, &[
            1.0,  0.2,  0.3,
            0.2,  1.0, -0.1,
            0.3, -0.1,  1.0,
        ]);
        let delta_drift = DVector::from_vec(vec![-0.15, 0.05, -0.08]);
        let vol_mult = DVector::from_vec(vec![3.0, 1.8, 2.5]);
        let skew = 0.85;

        let drift = adjust_drift(&base_drift, &delta_drift);
        let vol = adjust_vol(&base_vol, &vol_mult);
        let blended = blend_correlation(&base_corr, skew);
        let pd = nearest_pd(&blended);
        let cov = rebuild_covariance(&vol, &pd);
        let l = cholesky_decompose(&cov).expect("Cholesky should succeed on nearest-PD output");

        // Verify dimensions
        assert_eq!(drift.len(), 3);
        assert_eq!(vol.len(), 3);
        assert_eq!(l.nrows(), 3);
        assert_eq!(l.ncols(), 3);

        // Verify L is lower-triangular
        for i in 0..3 {
            for j in (i + 1)..3 {
                assert_relative_eq!(l[(i, j)], 0.0, epsilon = 1e-10);
            }
        }

        // Verify roundtrip
        let reconstructed = &l * l.transpose();
        assert_relative_eq!(reconstructed, cov, epsilon = 1e-6);
    }
}
