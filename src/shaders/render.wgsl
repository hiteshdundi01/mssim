// ═══════════════════════════════════════════════════════════════════
// MSSIM Render Shader — Bioluminescent Particle Cloud
// ═══════════════════════════════════════════════════════════════════
//
// Instanced quad rendering: 6 vertices per instance (2 triangles).
// Each particle is a soft-glow billboard colored by portfolio return.
// ═══════════════════════════════════════════════════════════════════

// ── Uniforms ────────────────────────────────────────────────────
struct RenderParams {
    point_size: f32,    // NDC half-size of each particle quad
    y_scale:    f32,    // Vertical scale for return values
    y_offset:   f32,    // Vertical center offset
    aspect:     f32,    // Canvas width / height
}

@group(0) @binding(0) var<uniform> params: RenderParams;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;

// ── Vertex output / Fragment input ──────────────────────────────
struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,          // Local quad UV [-1, 1]
    @location(1) portfolio_return: f32,   // Raw y value for color mapping
}

// ── Quad vertex offsets ─────────────────────────────────────────
// 6 vertices per quad (2 triangles), generated from vertex_index
fn quad_offset(vid: u32) -> vec2<f32> {
    // Triangle 1: (0,1,2) = (-1,-1), (1,-1), (-1,1)
    // Triangle 2: (3,4,5) = (-1,1), (1,-1), (1,1)
    switch(vid) {
        case 0u: { return vec2<f32>(-1.0, -1.0); }
        case 1u: { return vec2<f32>( 1.0, -1.0); }
        case 2u: { return vec2<f32>(-1.0,  1.0); }
        case 3u: { return vec2<f32>(-1.0,  1.0); }
        case 4u: { return vec2<f32>( 1.0, -1.0); }
        case 5u: { return vec2<f32>( 1.0,  1.0); }
        default: { return vec2<f32>(0.0, 0.0); }
    }
}

// ── Vertex Shader ───────────────────────────────────────────────
@vertex
fn vs_main(
    @builtin(vertex_index) vid: u32,
    @builtin(instance_index) iid: u32,
) -> VertexOut {
    let particle = positions[iid];

    // Map compute space → NDC
    // x: [0, 1] → [-1, 1]
    let ndc_x = particle.x * 2.0 - 1.0;

    // y: raw portfolio return, scaled + centered
    let ndc_y = particle.y * params.y_scale + params.y_offset;

    // Quad offset, corrected for aspect ratio
    let offset = quad_offset(vid % 6u);
    let size = params.point_size;

    var out: VertexOut;
    out.pos = vec4<f32>(
        ndc_x + offset.x * size / params.aspect,
        ndc_y + offset.y * size,
        0.0, 1.0
    );
    out.uv = offset;
    out.portfolio_return = particle.y;
    return out;
}

// ── Color Mapping ───────────────────────────────────────────────
// Bioluminescent cyan (normal) → orange → red (tail risk)
fn return_color(r: f32) -> vec3<f32> {
    let cyan    = vec3<f32>(0.0, 0.85, 1.0);
    let orange  = vec3<f32>(1.0, 0.55, 0.1);
    let red     = vec3<f32>(1.0, 0.15, 0.05);

    // Thresholds
    let t_warn = -0.10;  // Start transitioning
    let t_danger = -0.30; // Full tail-risk color

    if (r > t_warn) {
        return cyan;
    }
    if (r < t_danger) {
        return red;
    }

    // Interpolate cyan → orange → red
    let t = (t_warn - r) / (t_warn - t_danger); // 0 at warn, 1 at danger
    if (t < 0.5) {
        return mix(cyan, orange, t * 2.0);
    }
    return mix(orange, red, (t - 0.5) * 2.0);
}

// ── Fragment Shader ─────────────────────────────────────────────
@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    // Radial distance from quad center
    let dist = length(in.uv);

    // Soft circular falloff — discard pixels outside the circle
    if (dist > 1.0) {
        discard;
    }

    // Smooth glow falloff — wider core for visible particles
    let glow = smoothstep(1.0, 0.0, dist);

    // Color from portfolio return
    let color = return_color(in.portfolio_return);

    // Alpha for additive blending — higher for visible individual particles
    let alpha = glow * 0.35;

    return vec4<f32>(color * alpha, alpha);
}
