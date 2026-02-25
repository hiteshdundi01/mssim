// ── WebGPU Compute Pipeline Orchestration ───────────────────────
//
// Manages GPU buffers, pipeline creation, and dispatch.
// Data flow: EngineOutput (WASM Float32Arrays) → GPU buffers → compute → positions

import type { EngineOutput } from './types';
import shaderSource from './shaders/simulate.wgsl?raw';

// ── Constants ───────────────────────────────────────────────────
const WORKGROUP_SIZE = 256;
const MAX_ASSETS = 16;

// Must match the WGSL SimParams struct layout (8 × u32/f32 = 32 bytes)
const SIM_PARAMS_SIZE = 32;

// ── Public Types ────────────────────────────────────────────────
export interface ComputeResources {
    device: GPUDevice;
    pipeline: GPUComputePipeline;
    paramBuffer: GPUBuffer;
    driftBuffer: GPUBuffer;
    volBuffer: GPUBuffer;
    choleskyBuffer: GPUBuffer;
    weightsBuffer: GPUBuffer;
    positionBuffer: GPUBuffer;
    readbackBuffer: GPUBuffer;
    bindGroupLayout: GPUBindGroupLayout;
    bindGroup: GPUBindGroup;
    numParticles: number;
}

// ── Helpers ─────────────────────────────────────────────────────

/** Align a byte size up to the given alignment. */
function align(size: number, alignment: number): number {
    return Math.ceil(size / alignment) * alignment;
}

/** Create a GPU buffer and optionally write initial data. */
function makeBuffer(
    device: GPUDevice,
    label: string,
    size: number,
    usage: GPUBufferUsageFlags,
    data?: ArrayBufferView,
): GPUBuffer {
    const alignedSize = align(Math.max(size, 4), 4);
    const buffer = device.createBuffer({ label, size: alignedSize, usage, mappedAtCreation: !!data });
    if (data) {
        const dst = new Float32Array(buffer.getMappedRange());
        dst.set(data instanceof Float32Array ? data : new Float32Array(data.buffer));
        buffer.unmap();
    }
    return buffer;
}

// ── Pipeline Creation ───────────────────────────────────────────

export async function createComputePipeline(
    device: GPUDevice,
    numParticles: number,
): Promise<ComputeResources> {
    // Compile shader module
    const shaderModule = device.createShaderModule({
        label: 'simulate',
        code: shaderSource,
    });

    // Define bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
        label: 'simulate-bgl',
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ],
    });

    // Create pipeline
    const pipeline = await device.createComputePipelineAsync({
        label: 'simulate-pipeline',
        layout: device.createPipelineLayout({
            label: 'simulate-layout',
            bindGroupLayouts: [bindGroupLayout],
        }),
        compute: { module: shaderModule, entryPoint: 'main' },
    });

    // ── Allocate buffers ────────────────────────────────────────

    // Storage buffer sizes — sized for MAX_ASSETS to avoid recreation
    const vecSize = MAX_ASSETS * 4;           // N f32s
    const matSize = MAX_ASSETS * MAX_ASSETS * 4; // N×N f32s
    const posSize = numParticles * 2 * 4;     // vec2<f32> per particle

    const paramBuffer = makeBuffer(
        device, 'params', SIM_PARAMS_SIZE,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );

    const driftBuffer = makeBuffer(
        device, 'drift', vecSize,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );

    const volBuffer = makeBuffer(
        device, 'vol', vecSize,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );

    const choleskyBuffer = makeBuffer(
        device, 'cholesky', matSize,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );

    const weightsBuffer = makeBuffer(
        device, 'weights', vecSize,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );

    const positionBuffer = makeBuffer(
        device, 'positions', posSize,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    );

    // Staging buffer for CPU readback (verification only)
    const readbackBuffer = device.createBuffer({
        label: 'readback',
        size: posSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // ── Bind group ──────────────────────────────────────────────
    const bindGroup = device.createBindGroup({
        label: 'simulate-bg',
        layout: bindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: paramBuffer } },
            { binding: 1, resource: { buffer: driftBuffer } },
            { binding: 2, resource: { buffer: volBuffer } },
            { binding: 3, resource: { buffer: choleskyBuffer } },
            { binding: 4, resource: { buffer: weightsBuffer } },
            { binding: 5, resource: { buffer: positionBuffer } },
        ],
    });

    console.log(`[MSSIM] Compute pipeline created: ${numParticles} particles, ${Math.ceil(numParticles / WORKGROUP_SIZE)} workgroups`);

    return {
        device, pipeline,
        paramBuffer, driftBuffer, volBuffer, choleskyBuffer, weightsBuffer,
        positionBuffer, readbackBuffer,
        bindGroupLayout, bindGroup,
        numParticles,
    };
}

// ── Dispatch ────────────────────────────────────────────────────

export function dispatchSimulation(
    resources: ComputeResources,
    engineOutput: EngineOutput,
    weights: number[],
): void {
    const { device, pipeline, bindGroup, numParticles } = resources;
    const n = engineOutput.numAssets;

    // Write SimParams uniform
    const paramsData = new ArrayBuffer(SIM_PARAMS_SIZE);
    const paramsU32 = new Uint32Array(paramsData);
    const paramsF32 = new Float32Array(paramsData);
    paramsU32[0] = n;                               // num_assets
    paramsU32[1] = numParticles;                     // num_particles
    paramsF32[2] = 1.0;                              // dt (1 year)
    paramsF32[3] = engineOutput.jumpLambda;           // jump_lambda
    paramsF32[4] = engineOutput.jumpMean;             // jump_mean
    paramsF32[5] = engineOutput.jumpVol;              // jump_vol
    paramsU32[6] = (Math.random() * 0xFFFFFFFF) >>> 0; // seed
    paramsU32[7] = 0;                                // _pad

    device.queue.writeBuffer(resources.paramBuffer, 0, paramsData);
    device.queue.writeBuffer(resources.driftBuffer, 0, engineOutput.adjustedDrift);
    device.queue.writeBuffer(resources.volBuffer, 0, engineOutput.adjustedVol);
    device.queue.writeBuffer(resources.choleskyBuffer, 0, engineOutput.choleskyL);
    device.queue.writeBuffer(resources.weightsBuffer, 0, new Float32Array(weights));

    // Encode and submit compute pass
    const encoder = device.createCommandEncoder({ label: 'simulate-cmd' });
    const pass = encoder.beginComputePass({ label: 'simulate-pass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(numParticles / WORKGROUP_SIZE));
    pass.end();

    device.queue.submit([encoder.finish()]);
}

// ── Readback (verification only — removed in Step 3) ────────────

export async function readbackPositions(
    resources: ComputeResources,
): Promise<Float32Array> {
    const { device, positionBuffer, readbackBuffer, numParticles } = resources;
    const byteSize = numParticles * 2 * 4;

    const encoder = device.createCommandEncoder({ label: 'readback-cmd' });
    encoder.copyBufferToBuffer(positionBuffer, 0, readbackBuffer, 0, byteSize);
    device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(readbackBuffer.getMappedRange().slice(0));
    readbackBuffer.unmap();

    return data;
}
