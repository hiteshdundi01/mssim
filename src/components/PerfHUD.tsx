interface PerfHUDProps {
    particles: number;
    computeMs: number | null;
    renderMs: number | null;
    gpuName: string | null;
}

export function PerfHUD({ particles, computeMs, renderMs, gpuName }: PerfHUDProps) {
    if (computeMs === null) return null;

    const totalMs = computeMs + (renderMs ?? 0);

    return (
        <div className="perf-hud" title="Technical: GPU compute + render pipeline timing">
            <span>{particles.toLocaleString()} simulations</span>
            <span className="perf-sep">·</span>
            <span>calculated in {totalMs.toFixed(1)}ms</span>
            {gpuName && (
                <>
                    <span className="perf-sep">·</span>
                    <span className="perf-gpu">{gpuName}</span>
                </>
            )}
        </div>
    );
}
