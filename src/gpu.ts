// ── WebGPU device/adapter initialization ────────────────────────

export interface GPUContext {
    device: GPUDevice;
    adapter: GPUAdapter;
}

/**
 * Initialize WebGPU. Returns null if the browser doesn't support it.
 * Requests a high-performance adapter (discrete GPU preferred).
 */
export async function initWebGPU(): Promise<GPUContext | null> {
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

    // 3. Request device (compute is baseline WebGPU — no special features needed)
    const device = await adapter.requestDevice();

    // 4. Handle device loss
    device.lost.then((info) => {
        console.error(`[MSSIM] WebGPU device lost: ${info.reason}`, info.message);
    });

    // 5. Handle uncaptured errors
    device.addEventListener('uncapturederror', (event) => {
        console.error('[MSSIM] WebGPU uncaptured error:', event.error);
    });

    console.log('[MSSIM] WebGPU initialized');
    return { device, adapter };
}
