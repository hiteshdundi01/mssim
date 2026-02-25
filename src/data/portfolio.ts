import type { Portfolio } from '../types';

/**
 * Default 3-asset portfolio.
 * Parameterized — change `assets` length and all arrays scale accordingly.
 */
export const DEFAULT_PORTFOLIO: Portfolio = {
    assets: ['Equities', 'Bonds', 'Commodities'],
    weights: [0.6, 0.3, 0.1],
    baseDrift: [0.08, 0.03, 0.05],
    baseVol: [0.18, 0.06, 0.22],
    // Flattened 3×3 correlation matrix (row-major)
    //           Eq    Bd    Cm
    // Eq     [ 1.0,  0.2,  0.3 ]
    // Bd     [ 0.2,  1.0, -0.1 ]
    // Cm     [ 0.3, -0.1,  1.0 ]
    baseCorrelation: [
        1.0, 0.2, 0.3,
        0.2, 1.0, -0.1,
        0.3, -0.1, 1.0,
    ],
};
