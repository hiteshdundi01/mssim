import { useRef, useEffect, useState, useCallback } from 'react';
import { PresetBar } from './components/PresetBar';
import { initWebGPU } from './gpu';
import { createComputePipeline, dispatchSimulation, readbackPositions } from './compute';
import { DEFAULT_PORTFOLIO } from './data/portfolio';
import type { EngineOutput } from './types';
import type { ComputeResources } from './compute';
import './index.css';

const NUM_PARTICLES = 100_000;

type GpuStatus = 'initializing' | 'ready' | 'error' | 'unsupported';

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const computeRef = useRef<ComputeResources | null>(null);
    const [gpuStatus, setGpuStatus] = useState<GpuStatus>('initializing');
    const [computing, setComputing] = useState(false);

    // ── Initialize WebGPU + compute pipeline on mount ───────────
    useEffect(() => {
        let cancelled = false;

        async function init() {
            const ctx = await initWebGPU();
            if (cancelled) return;

            if (!ctx) {
                setGpuStatus('unsupported');
                return;
            }

            try {
                const resources = await createComputePipeline(ctx.device, NUM_PARTICLES);
                if (cancelled) return;
                computeRef.current = resources;
                setGpuStatus('ready');
            } catch (e) {
                console.error('[MSSIM] Compute pipeline creation failed:', e);
                if (!cancelled) setGpuStatus('error');
            }
        }

        init();
        return () => { cancelled = true; };
    }, []);

    // ── Handle shock computation → GPU dispatch ─────────────────
    const handleComputed = useCallback(async (output: EngineOutput) => {
        const resources = computeRef.current;
        if (!resources) {
            console.warn('[MSSIM] GPU not ready — skipping compute dispatch');
            return;
        }

        setComputing(true);
        const t0 = performance.now();

        try {
            // Upload WASM outputs to GPU and dispatch compute
            dispatchSimulation(resources, output, DEFAULT_PORTFOLIO.weights);

            // Readback for verification (temporary — removed in Step 3)
            const positions = await readbackPositions(resources);
            const elapsed = (performance.now() - t0).toFixed(1);

            console.log(`[MSSIM] Compute dispatched: ${NUM_PARTICLES.toLocaleString()} particles in ${elapsed}ms`);

            // Log a sample of positions
            const sampleSize = Math.min(10, NUM_PARTICLES);
            const sample: { x: number; y: number }[] = [];
            for (let i = 0; i < sampleSize; i++) {
                sample.push({ x: positions[i * 2], y: positions[i * 2 + 1] });
            }
            console.log('[MSSIM] Readback sample (first 10 particles):', sample);

            // Quick sanity check
            let nanCount = 0;
            let infCount = 0;
            for (let i = 0; i < positions.length; i++) {
                if (isNaN(positions[i])) nanCount++;
                if (!isFinite(positions[i])) infCount++;
            }
            if (nanCount > 0 || infCount > 0) {
                console.warn(`[MSSIM] ⚠ Data quality: ${nanCount} NaN, ${infCount} Infinity values`);
            } else {
                console.log('[MSSIM] ✓ No NaN/Infinity values in output');
            }
        } catch (e) {
            console.error('[MSSIM] GPU compute error:', e);
        } finally {
            setComputing(false);
        }
    }, []);

    // ── Status text ─────────────────────────────────────────────
    const statusLabel = {
        initializing: 'WebGPU Pipeline',
        ready: 'WebGPU Pipeline',
        error: 'WebGPU Error',
        unsupported: 'WebGPU Unavailable',
    }[gpuStatus];

    const statusValue = {
        initializing: 'Initializing…',
        ready: computing
            ? `Computing ${NUM_PARTICLES.toLocaleString()} particles…`
            : `Ready — ${NUM_PARTICLES.toLocaleString()} particles`,
        error: 'Pipeline creation failed — check console',
        unsupported: 'This browser does not support WebGPU',
    }[gpuStatus];

    return (
        <>
            {/* Subtle grid background */}
            <div className="grid-bg" />

            {/* WebGPU canvas — rendering wired in Step 3 */}
            <div className="canvas-container">
                <canvas ref={canvasRef} />
            </div>

            {/* Center status */}
            <div className="status-center">
                <span className="status-label">{statusLabel}</span>
                <span className="status-value">{statusValue}</span>
            </div>

            {/* Overlay UI */}
            <div className="ui-overlay">
                {/* Header */}
                <div className="header">
                    <div className="header-title">
                        <span>MSSIM</span> &mdash; Macro-Shock Particle Simulator
                    </div>
                </div>

                {/* Preset buttons at bottom */}
                <PresetBar onComputed={handleComputed} />
            </div>
        </>
    );
}
