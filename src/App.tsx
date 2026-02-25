import { useRef } from 'react';
import { PresetBar } from './components/PresetBar';
import './index.css';

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    return (
        <>
            {/* Subtle grid background */}
            <div className="grid-bg" />

            {/* WebGPU canvas — wired in Step 2 */}
            <div className="canvas-container">
                <canvas ref={canvasRef} />
            </div>

            {/* Placeholder center status */}
            <div className="status-center">
                <span className="status-label">WebGPU Pipeline</span>
                <span className="status-value">Awaiting Compute Shader (Step 2)</span>
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
                <PresetBar />
            </div>
        </>
    );
}
