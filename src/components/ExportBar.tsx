import { useCallback, useRef, useState } from 'react';
import type { SimStats } from '../stats';
import type { Portfolio } from '../types';

interface ExportBarProps {
    stats: SimStats | null;
    shockName: string | null;
    portfolio: Portfolio;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function ExportBar({ stats, shockName, portfolio, canvasRef }: ExportBarProps) {
    const [copied, setCopied] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);

    const buildNarrative = useCallback((): string => {
        if (!stats || !shockName) return '';
        const var95 = (Math.abs(stats.var95) * 100).toFixed(1);
        const cvar95 = (Math.abs(stats.cvar95) * 100).toFixed(1);
        const tail = stats.tailPct.toFixed(1);
        const mean = (stats.mean * 100).toFixed(1);

        let text = `MSSIM Stress Test — ${shockName}\n`;
        text += `Portfolio: ${portfolio.assets.map((a, i) => `${a} ${(portfolio.weights[i] * 100).toFixed(0)}%`).join(', ')}\n\n`;
        text += `Average Return: ${stats.mean >= 0 ? '+' : ''}${mean}%\n`;
        text += `Worst 1-in-20 (VaR 95%): ${stats.var95 >= 0 ? '+' : '-'}${var95}%\n`;
        text += `Average Worst Case (CVaR 95%): -${cvar95}%\n`;
        text += `Crash Probability (>30% loss): ${tail}%\n`;
        return text;
    }, [stats, shockName, portfolio]);

    const handleCopy = useCallback(async () => {
        const text = buildNarrative();
        if (!text) return;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [buildNarrative]);

    const handleShare = useCallback(async () => {
        // Encode portfolio + shock into URL params
        const params = new URLSearchParams();
        params.set('w', portfolio.weights.map(w => (w * 100).toFixed(0)).join(','));
        params.set('a', portfolio.assets.join(','));
        if (shockName) params.set('s', shockName);
        const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    }, [portfolio, shockName]);

    const handleDownloadPng = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mssim-${shockName?.toLowerCase().replace(/\s+/g, '-') ?? 'simulation'}.png`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }, [canvasRef, shockName]);

    if (!stats) return null;

    return (
        <div className="export-bar">
            <button className="export-btn" onClick={handleCopy} aria-label="Copy summary to clipboard">
                {copied ? '✓ Copied' : '📋 Copy Summary'}
            </button>
            <button className="export-btn" onClick={handleShare} aria-label="Copy share link">
                {linkCopied ? '✓ Link Copied' : '🔗 Share'}
            </button>
            <button className="export-btn" onClick={handleDownloadPng} aria-label="Download visualization as PNG">
                📷 Download PNG
            </button>
        </div>
    );
}
