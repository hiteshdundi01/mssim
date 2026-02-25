import { useRef, useEffect, useState, useCallback } from 'react';
import { PresetBar } from './components/PresetBar';
import { initWebGPU } from './gpu';
import { createComputePipeline, dispatchSimulation } from './compute';
import { createRenderPipeline, updateRenderUniforms, renderFrame } from './renderer';
import { DEFAULT_PORTFOLIO } from './data/portfolio';
import type { EngineOutput } from './types';
import type { ComputeResources } from './compute';
import type { RenderResources } from './renderer';
import './index.css';

const NUM_PARTICLES = 100_000;

type GpuStatus = 'initializing' | 'ready' | 'error' | 'unsupported';

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const computeRef = useRef<ComputeResources | null>(null);
    const renderRef = useRef<RenderResources | null>(null);
    const [hasSimulated, setHasSimulated] = useState(false);
    const [gpuStatus, setGpuStatus] = useState<GpuStatus>('initializing');

    // ── Initialize WebGPU + compute + render pipelines on mount ──
    useEffect(() => {
        let cancelled = false;

        async function init() {
            const canvas = canvasRef.current;
            if (!canvas) return;

            // Size canvas to device pixels
            const dpr = window.devicePixelRatio || 1;
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;

            const ctx = await initWebGPU(canvas);
            if (cancelled) return;

            if (!ctx) {
                setGpuStatus('unsupported');
                return;
            }

            try {
                // Create compute pipeline
                const compute = await createComputePipeline(ctx.device, NUM_PARTICLES);
                if (cancelled) return;
                computeRef.current = compute;

                // Create render pipeline — shares position buffer with compute
                const render = createRenderPipeline(
                    ctx.device, ctx.context, canvas,
                    compute.positionBuffer, NUM_PARTICLES,
                );
                renderRef.current = render;
                updateRenderUniforms(render);

                setGpuStatus('ready');
            } catch (e) {
                console.error('[MSSIM] Pipeline creation failed:', e);
                if (!cancelled) setGpuStatus('error');
            }
        }

        init();
        return () => { cancelled = true; };
    }, []);

    // ── Resize observer for DPR-aware canvas sizing ─────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const observer = new ResizeObserver(() => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;

            // Update render uniforms (aspect ratio changed)
            const render = renderRef.current;
            if (render) {
                updateRenderUniforms(render);
                // Re-render if we have particles
                renderFrame(render);
            }
        });

        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);

    // ── Handle shock computation → GPU dispatch → render ────────
    const handleComputed = useCallback((output: EngineOutput) => {
        const compute = computeRef.current;
        const render = renderRef.current;
        if (!compute || !render) {
            console.warn('[MSSIM] GPU not ready — skipping dispatch');
            return;
        }

        const t0 = performance.now();

        // Dispatch compute shader
        dispatchSimulation(compute, output, DEFAULT_PORTFOLIO.weights);

        // Render the result
        renderFrame(render);

        setHasSimulated(true);

        const elapsed = (performance.now() - t0).toFixed(1);
        console.log(`[MSSIM] Compute + render: ${NUM_PARTICLES.toLocaleString()} particles in ${elapsed}ms`);
    }, []);

    // ── Status (only shown before first simulation) ─────────────
    const showStatus = !hasSimulated;

    const statusLabel = {
        initializing: 'WebGPU Pipeline',
        ready: 'WebGPU Pipeline',
        error: 'WebGPU Error',
        unsupported: 'WebGPU Unavailable',
    }[gpuStatus];

    const statusValue = {
        initializing: 'Initializing…',
        ready: `Ready — ${NUM_PARTICLES.toLocaleString()} particles — select a preset`,
        error: 'Pipeline creation failed — check console',
        unsupported: 'This browser does not support WebGPU',
    }[gpuStatus];

    return (
        <>
            {/* Subtle grid background */}
            <div className="grid-bg" />

            {/* WebGPU canvas */}
            <div className="canvas-container">
                <canvas ref={canvasRef} />
            </div>

            {/* Center status — hidden once particles are rendered */}
            {showStatus && (
                <div className="status-center">
                    <span className="status-label">{statusLabel}</span>
                    <span className="status-value">{statusValue}</span>
                </div>
            )}

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
