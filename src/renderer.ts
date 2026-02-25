// ── WebGPU Render Pipeline ──────────────────────────────────────
//
// Instanced quad rendering with additive blending.
// Reads the position buffer written by the compute shader.

import renderShaderSource from './shaders/render.wgsl?raw';

// ── Constants ───────────────────────────────────────────────────
const VERTICES_PER_QUAD = 6;
const RENDER_PARAMS_SIZE = 16; // 4 × f32 = 16 bytes

// ── Public Types ────────────────────────────────────────────────
export interface RenderResources {
    device: GPUDevice;
    context: GPUCanvasContext;
    pipeline: GPURenderPipeline;
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
    format: GPUTextureFormat;
    numParticles: number;
    canvas: HTMLCanvasElement;
}

// ── Pipeline Creation ───────────────────────────────────────────

export function createRenderPipeline(
    device: GPUDevice,
    context: GPUCanvasContext,
    canvas: HTMLCanvasElement,
    positionBuffer: GPUBuffer,
    numParticles: number,
): RenderResources {
    const format = navigator.gpu.getPreferredCanvasFormat();

    // Configure canvas context
    context.configure({
        device,
        format,
        alphaMode: 'premultiplied',
    });

    // Compile render shader
    const shaderModule = device.createShaderModule({
        label: 'render',
        code: renderShaderSource,
    });

    // Bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
        label: 'render-bgl',
        entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        ],
    });

    // Uniform buffer
    const uniformBuffer = device.createBuffer({
        label: 'render-params',
        size: RENDER_PARAMS_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Bind group
    const bindGroup = device.createBindGroup({
        label: 'render-bg',
        layout: bindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: { buffer: positionBuffer } },
        ],
    });

    // Render pipeline with additive blending
    const pipeline = device.createRenderPipeline({
        label: 'render-pipeline',
        layout: device.createPipelineLayout({
            label: 'render-layout',
            bindGroupLayouts: [bindGroupLayout],
        }),
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_main',
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs_main',
            targets: [{
                format,
                blend: {
                    color: {
                        srcFactor: 'one',
                        dstFactor: 'one',
                        operation: 'add',
                    },
                    alpha: {
                        srcFactor: 'one',
                        dstFactor: 'one',
                        operation: 'add',
                    },
                },
                writeMask: GPUColorWrite.ALL,
            }],
        },
        primitive: {
            topology: 'triangle-list',
        },
    });

    console.log(`[MSSIM] Render pipeline created: ${numParticles} particles, ${format} format`);

    return {
        device, context, pipeline, uniformBuffer, bindGroup,
        format, numParticles, canvas,
    };
}

// ── Update Uniforms ─────────────────────────────────────────────

export function updateRenderUniforms(resources: RenderResources): void {
    const { device, uniformBuffer, canvas } = resources;
    const aspect = canvas.width / canvas.height;

    const data = new Float32Array(4);
    data[0] = 0.012;   // point_size — NDC half-size (~8px at 1080p)
    data[1] = 8.0;     // y_scale — amplify return values for visibility
    data[2] = 0.0;     // y_offset — center vertically
    data[3] = aspect;  // aspect ratio

    device.queue.writeBuffer(uniformBuffer, 0, data);
}

// ── Render Frame ────────────────────────────────────────────────

export function renderFrame(resources: RenderResources): void {
    const { device, context, pipeline, bindGroup, numParticles } = resources;

    const textureView = context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder({ label: 'render-cmd' });
    const pass = encoder.beginRenderPass({
        label: 'render-pass',
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.024, g: 0.039, b: 0.063, a: 1.0 }, // --color-bg: #060a10
            loadOp: 'clear',
            storeOp: 'store',
        }],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(VERTICES_PER_QUAD, numParticles, 0, 0);
    pass.end();

    device.queue.submit([encoder.finish()]);
}
