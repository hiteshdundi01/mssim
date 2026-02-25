import { useRef, useEffect, useState, useCallback } from 'react';
import { PresetBar } from './components/PresetBar';
import { StatsPanel } from './components/StatsPanel';
import { PerfHUD } from './components/PerfHUD';
import { initWebGPU } from './gpu';
import { createComputePipeline, dispatchSimulation, readbackPositions } from './compute';
import { createRenderPipeline, updateRenderUniforms, renderFrame } from './renderer';
import { computeStats } from './stats';
import { DEFAULT_PORTFOLIO } from './data/portfolio';
import type { EngineOutput } from './types';
import type { ComputeResources } from './compute';
import type { RenderResources } from './renderer';
import type { SimStats } from './stats';
import './index.css';

const NUM_PARTICLES = 100_000;

type GpuStatus = 'initializing' | 'ready' | 'error' | 'unsupported';

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const computeRef = useRef<ComputeResources | null>(null);
    const renderRef = useRef<RenderResources | null>(null);
    const [hasSimulated, setHasSimulated] = useState(false);
    const [gpuStatus, setGpuStatus] = useState<GpuStatus>('initializing');
    const [stats, setStats] = useState<SimStats | null>(null);
    const [computeMs, setComputeMs] = useState<number | null>(null);
    const [renderMs, setRenderMs] = useState<number | null>(null);
    const [gpuName, setGpuName] = useState<string | null>(null);

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
                // Get GPU adapter info (synchronous in modern Chrome)
                const info = ctx.adapter.info;
                if (!cancelled && info) {
                    setGpuName(info.description || info.vendor || 'WebGPU');
                }

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

            const render = renderRef.current;
            if (render) {
                updateRenderUniforms(render);
                renderFrame(render);
            }
        });

        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);

    // ── Handle shock computation → GPU dispatch → render → stats ─
    const handleComputed = useCallback(async (output: EngineOutput) => {
        const compute = computeRef.current;
        const render = renderRef.current;
        if (!compute || !render) {
            console.warn('[MSSIM] GPU not ready — skipping dispatch');
            return;
        }

        // Compute dispatch
        const t0 = performance.now();
        dispatchSimulation(compute, output, DEFAULT_PORTFOLIO.weights);
        const t1 = performance.now();

        // Render
        renderFrame(render);
        const t2 = performance.now();

        setHasSimulated(true);
        setComputeMs(t1 - t0);
        setRenderMs(t2 - t1);

        console.log(`[MSSIM] Compute: ${(t1 - t0).toFixed(1)}ms | Render: ${(t2 - t1).toFixed(1)}ms`);

        // Async readback for stats (doesn't block rendering)
        try {
            const positions = await readbackPositions(compute);
            const s = computeStats(positions, NUM_PARTICLES);
            setStats(s);
            console.log('[MSSIM] Stats:', {
                mean: (s.mean * 100).toFixed(2) + '%',
                stdDev: (s.stdDev * 100).toFixed(2) + '%',
                var95: (s.var95 * 100).toFixed(2) + '%',
                tailPct: s.tailPct.toFixed(1) + '%',
            });
        } catch (e) {
            console.warn('[MSSIM] Stats readback failed:', e);
        }
    }, []);

    // ── Status (only shown before first simulation) ─────────────
    const showStatus = !hasSimulated;

    const statusLabel = {
        initializing: 'Getting Ready',
        ready: 'Ready to Simulate',
        error: 'Something Went Wrong',
        unsupported: 'Browser Not Supported',
    }[gpuStatus];

    const statusValue = {
        initializing: 'Setting up the simulation engine…',
        ready: `Pick a crisis scenario below to see how ${NUM_PARTICLES.toLocaleString()} possible futures play out for your portfolio`,
        error: 'The simulation engine couldn\'t start — try a different browser',
        unsupported: 'This browser doesn\'t support GPU-accelerated graphics. Try Chrome or Edge.',
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
                        <span>MSSIM</span>
                        <span className="header-subtitle">What happens to your portfolio under stress?</span>
                    </div>
                    <PerfHUD
                        particles={NUM_PARTICLES}
                        computeMs={computeMs}
                        renderMs={renderMs}
                        gpuName={gpuName}
                    />
                </div>

                {/* Explainer — appears after first simulation */}
                {hasSimulated && (
                    <div className="explainer">
                        Each dot is one possible future for your portfolio.
                        <span className="explainer-cyan">Cyan dots</span> are normal outcomes.
                        <span className="explainer-red">Red dots</span> are severe losses.
                    </div>
                )}

                {/* Stats panel — top right */}
                <StatsPanel stats={stats} />

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Preset buttons at bottom */}
                <PresetBar onComputed={handleComputed} />
            </div>
        </>
    );
}
