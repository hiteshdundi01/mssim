import { useRef, useEffect, useState, useCallback } from 'react';
import { Onboarding } from './components/Onboarding';
import { PortfolioBuilder } from './components/PortfolioBuilder';
import { PortfolioPanel } from './components/PortfolioPanel';
import { PresetBar } from './components/PresetBar';
import { StatsPanel } from './components/StatsPanel';
import { NarrativeSummary } from './components/NarrativeSummary';
import { ComparisonTable } from './components/ComparisonTable';
import { ExportBar } from './components/ExportBar';
import { CanvasOverlay } from './components/CanvasOverlay';
import { PerfHUD } from './components/PerfHUD';
import { initWebGPU } from './gpu';
import { createComputePipeline, dispatchSimulation, readbackPositions } from './compute';
import { createRenderPipeline, updateRenderUniforms, renderFrame } from './renderer';
import { computeStats } from './stats';
import { DEFAULT_PORTFOLIO } from './data/portfolio';
import { PORTFOLIO_PRESETS, buildPortfolioFromAllocations } from './data/assetClasses';
import type { Portfolio, EngineOutput, ShockResult } from './types';
import type { ComputeResources } from './compute';
import type { RenderResources } from './renderer';
import type { SimStats } from './stats';
import './index.css';

const NUM_PARTICLES = 100_000;

type GpuStatus = 'initializing' | 'ready' | 'error' | 'unsupported';
type AppPhase = 'onboarding' | 'building' | 'ready' | 'simulated';

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const computeRef = useRef<ComputeResources | null>(null);
    const renderRef = useRef<RenderResources | null>(null);

    // App phase
    const [phase, setPhase] = useState<AppPhase>('onboarding');
    const [gpuStatus, setGpuStatus] = useState<GpuStatus>('initializing');

    // Portfolio
    const [portfolio, setPortfolio] = useState<Portfolio>(DEFAULT_PORTFOLIO);
    const [allocations, setAllocations] = useState<Record<string, number>>(
        { equities: 0.60, bonds: 0.30, commodities: 0.10, real_estate: 0, cash: 0 }
    );
    const [showBuilder, setShowBuilder] = useState(false);

    // Simulation
    const [stats, setStats] = useState<SimStats | null>(null);
    const [activeShockName, setActiveShockName] = useState<string | null>(null);
    const [activeShockId, setActiveShockId] = useState<string | null>(null);
    const [computeMs, setComputeMs] = useState<number | null>(null);
    const [renderMs, setRenderMs] = useState<number | null>(null);
    const [gpuName, setGpuName] = useState<string | null>(null);

    // Scenario comparison
    const [scenarioResults, setScenarioResults] = useState<ShockResult[]>([]);

    // ── Initialize WebGPU ──────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        async function init() {
            const canvas = canvasRef.current;
            if (!canvas) return;

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
                const info = ctx.adapter.info;
                if (!cancelled && info) {
                    setGpuName(info.description || info.vendor || 'WebGPU');
                }

                const compute = await createComputePipeline(ctx.device, NUM_PARTICLES);
                if (cancelled) return;
                computeRef.current = compute;

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

    // ── Resize observer ────────────────────────────────────────
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

    // ── Handle engine computation → GPU → stats ────────────────
    const handleComputed = useCallback(async (output: EngineOutput, shockName?: string, shockId?: string) => {
        const compute = computeRef.current;
        const render = renderRef.current;
        if (!compute || !render) {
            console.warn('[MSSIM] GPU not ready — skipping dispatch');
            return;
        }

        const t0 = performance.now();
        dispatchSimulation(compute, output, portfolio.weights);
        const t1 = performance.now();

        renderFrame(render);
        const t2 = performance.now();

        setPhase('simulated');
        setComputeMs(t1 - t0);
        setRenderMs(t2 - t1);
        if (shockName) setActiveShockName(shockName);
        if (shockId) setActiveShockId(shockId);

        try {
            const positions = await readbackPositions(compute);
            const s = computeStats(positions, NUM_PARTICLES);
            setStats(s);

            // Add to comparison
            if (shockId && shockName) {
                setScenarioResults(prev => {
                    const filtered = prev.filter(r => r.shockId !== shockId);
                    return [...filtered, { shockId, shockName, stats: s }];
                });
            }
        } catch (e) {
            console.warn('[MSSIM] Stats readback failed:', e);
        }
    }, [portfolio.weights]);

    // ── Portfolio actions ───────────────────────────────────────
    const handleUseSample = useCallback(() => {
        setPortfolio(DEFAULT_PORTFOLIO);
        setAllocations({ equities: 0.60, bonds: 0.30, commodities: 0.10, real_estate: 0, cash: 0 });
        setPhase('ready');
    }, []);

    const handleBuildPortfolio = useCallback(() => {
        setPhase('building');
        setShowBuilder(true);
    }, []);

    const handleApplyPortfolio = useCallback((p: Portfolio, alloc: Record<string, number>) => {
        setPortfolio(p);
        setAllocations(alloc);
        setShowBuilder(false);
        setPhase('ready');
        setScenarioResults([]);
        setStats(null);
        setActiveShockName(null);
        setActiveShockId(null);
    }, []);

    // ── Status messages ────────────────────────────────────────
    const showStatus = phase === 'ready';

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

    // ── Render ──────────────────────────────────────────────────
    return (
        <>
            {/* Subtle grid background */}
            <div className="grid-bg" />

            {/* WebGPU canvas */}
            <div className="canvas-container">
                <canvas ref={canvasRef} role="img" aria-label="Monte Carlo simulation visualization showing portfolio return distribution as glowing particles" />
                {phase === 'simulated' && <CanvasOverlay />}
            </div>

            {/* Onboarding — shown on first visit */}
            {phase === 'onboarding' && (
                <Onboarding
                    onBuildPortfolio={handleBuildPortfolio}
                    onUseSample={handleUseSample}
                />
            )}

            {/* Portfolio builder modal */}
            {showBuilder && (
                <PortfolioBuilder
                    onApply={handleApplyPortfolio}
                    onClose={() => {
                        setShowBuilder(false);
                        if (phase === 'building') setPhase('onboarding');
                    }}
                    initialAllocations={allocations}
                />
            )}

            {/* Main UI overlay — hidden during onboarding */}
            {phase !== 'onboarding' && phase !== 'building' && (
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

                    {/* Content area — sidebar + main */}
                    <div className="content-row">
                        {/* Left sidebar: Portfolio panel */}
                        <div className="sidebar">
                            <PortfolioPanel
                                allocations={allocations}
                                onEdit={() => setShowBuilder(true)}
                            />
                        </div>

                        {/* Right side: stats + narrative */}
                        <div className="main-content">
                            {/* Explainer */}
                            {phase === 'simulated' && (
                                <div className="explainer">
                                    Each dot is one possible future for your portfolio.{' '}
                                    <span className="explainer-cyan">Cyan dots</span> are normal outcomes.{' '}
                                    <span className="explainer-red">Red dots</span> are severe losses.
                                </div>
                            )}

                            <StatsPanel stats={stats} />
                            {stats && activeShockName && (
                                <NarrativeSummary stats={stats} shockName={activeShockName} />
                            )}
                        </div>
                    </div>

                    {/* Center status */}
                    {showStatus && (
                        <div className="status-center-inline">
                            <span className="status-label">{statusLabel}</span>
                            <span className="status-value">{statusValue}</span>
                        </div>
                    )}

                    {/* Spacer */}
                    <div style={{ flex: 1 }} />

                    {/* Comparison table */}
                    <ComparisonTable results={scenarioResults} />

                    {/* Export bar */}
                    <ExportBar
                        stats={stats}
                        shockName={activeShockName}
                        portfolio={portfolio}
                        canvasRef={canvasRef}
                    />

                    {/* Preset buttons at bottom */}
                    <PresetBar
                        portfolio={portfolio}
                        allocations={allocations}
                        onComputed={handleComputed}
                    />
                </div>
            )}
        </>
    );
}
