import type { MacroShock } from '../types';

export const SHOCKS: Record<string, MacroShock> = {
    rate_hike: {
        id: 'rate_hike',
        name: 'Rate Hike',
        deltaDrift: [-0.02, 0.01, -0.01],
        volMultiplier: [1.3, 1.1, 1.2],
        correlationSkew: 0.3,
        jumpLambda: 0.5,
        jumpMean: -0.02,
        jumpVol: 0.03,
    },
    black_swan: {
        id: 'black_swan',
        name: 'Black Swan',
        deltaDrift: [-0.15, 0.05, -0.08],
        volMultiplier: [3.0, 1.8, 2.5],
        correlationSkew: 0.85,
        jumpLambda: 4.0,
        jumpMean: -0.12,
        jumpVol: 0.08,
    },
    stagflation: {
        id: 'stagflation',
        name: 'Stagflation',
        deltaDrift: [-0.06, -0.02, 0.04],
        volMultiplier: [1.8, 1.4, 2.0],
        correlationSkew: 0.55,
        jumpLambda: 1.5,
        jumpMean: -0.05,
        jumpVol: 0.06,
    },
};

export const SHOCK_LIST = Object.values(SHOCKS);
