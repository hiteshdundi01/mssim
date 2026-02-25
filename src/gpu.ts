// ── WebGPU device/adapter initialization ────────────────────────

export interface GPUContext {
    device: GPUDevice;
    adapter: GPUAdapter;
    context: GPUCanvasContext;
}

/**
 * Initialize WebGPU with a canvas element.
 * Returns null if the browser doesn't support WebGPU.
 * Requests a high-performance adapter (discrete GPU preferred).
 */
export async function initWebGPU(canvas: HTMLCanvasElement): Promise<GPUContext | null> {
    // 1. Feature detection
    if (!navigator.gpu) {
        console.warn('[MSSIM] WebGPU not supported in this browser');
        return null;
    }

    // 2. Request adapter
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
    });
    if (!adapter) {
        console.warn('[MSSIM] No WebGPU adapter available');
        return null;
    }

    // 3. Request device (compute + render are baseline WebGPU)
    const device = await adapter.requestDevice();

    // 4. Get canvas context
    const context = canvas.getContext('webgpu');
    if (!context) {
        console.warn('[MSSIM] Failed to get WebGPU canvas context');
        return null;
    }

    // 5. Handle device loss
    device.lost.then((info) => {
        console.error(`[MSSIM] WebGPU device lost: ${info.reason}`, info.message);
    });

    // 6. Handle uncaptured errors
    device.addEventListener('uncapturederror', (event) => {
        console.error('[MSSIM] WebGPU uncaptured error:', event.error);
    });

    console.log('[MSSIM] WebGPU initialized');
    return { device, adapter, context };
}
