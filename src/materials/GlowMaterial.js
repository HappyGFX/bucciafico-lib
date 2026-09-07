import * as THREE from 'three';

const vertexShader = `
    uniform float thickness;
    uniform mat4 gradientMatrix;
    uniform mat3 gradientNormalMatrix;
    varying vec2 vUv;
    varying float vY;
    varying vec3 vNormal;
    #ifdef SURFACE_GLOW
        attribute vec3 glowPosition;
        attribute vec3 glowNormal;
        varying vec3 vGlowPosition;
        varying vec3 vGlowNormal;
    #endif
    void main() {
        vUv = uv;
        vNormal = normalize(gradientNormalMatrix * normal);
        vec3 newPos = position + normal * thickness;
        #ifdef SURFACE_GLOW
            vGlowPosition = glowPosition;
            vGlowNormal = glowNormal;
            newPos = position + normal * 0.002;
        #endif
        vY = (gradientMatrix * vec4(position, 1.0)).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
    }
`;

const fragmentShader = `
    uniform sampler2D skinMap;
    uniform bool hasSkinMap;
    varying vec2 vUv;
    uniform float opacity;
    uniform float glowGain;
    uniform float gradientLimit;
    uniform float partHeight;
    uniform float minY;
    varying float vY;
    varying vec3 vNormal;
    #ifdef SURFACE_GLOW
        uniform vec3 boundsMin;
        uniform vec3 boundsMax;
        uniform float rimWidth;
        varying vec3 vGlowPosition;
        varying vec3 vGlowNormal;
    #endif
    void main() {
        if (opacity <= 0.01 || glowGain <= 0.0) discard;
        float skinAlpha = hasSkinMap ? texture2D(skinMap,vUv).a : 1.0;
        if(skinAlpha < 0.0039) discard;
        if (vNormal.y < -0.9) discard;
        
        float normalizedY = (vY - minY) / partHeight;
        float alpha = smoothstep(1.0 - gradientLimit, 1.0, normalizedY);
        alpha *= smoothstep(0.0, 0.2, normalizedY);
        #ifdef SURFACE_GLOW
            // Measure inward from the edges of the undeformed part. Keeping these
            // coordinates through joint subdivision lets the highlight bend with it.
            vec3 edge = max(min(vGlowPosition - boundsMin, boundsMax - vGlowPosition), vec3(0.0));
            vec3 n = abs(vGlowNormal);
            vec2 faceEdges = n.x > 0.5 ? edge.yz : (n.y > 0.5 ? edge.xz : edge.xy);
            // Wide rounded flare at the upper corners, tapering to a fine point
            // down the side. This lights the face itself instead of expanding it.
            float width = max(0.015, rimWidth * (0.08 + 0.92 * alpha * alpha));
            vec2 lobes = exp(-pow(faceEdges / width, vec2(1.5)) * 2.0);
            float rim = 1.0 - (1.0 - lobes.x) * (1.0 - lobes.y);
            alpha *= rim;
        #endif
        
        // HDR rim feeds bloom without raising the brightness of the skin itself.
        gl_FragColor = vec4(vec3(2.0 * glowGain), alpha * opacity * skinAlpha);
    }
`;

/**
 * Creates a ShaderMaterial for the glow effect.
 * It renders a larger, back-side version of the mesh with an opacity gradient.
 * @param {number} partHeight - Height of the body part for gradient calculation.
 */
export function createGlowMaterial(partHeight, texture = null, gradient = {}) {
    return new THREE.ShaderMaterial({
        uniforms: {
            skinMap: {value: texture},
            hasSkinMap: {value: !!texture},
            opacity: {value: 0.0},
            glowGain: {value: 1.0},
            gradientLimit: {value: 0.8},
            thickness: {value: 0.0},
            partHeight: {value: partHeight},
            minY: {value: gradient.minY ?? -partHeight / 2},
            gradientMatrix: {value: gradient.matrix || new THREE.Matrix4()},
            gradientNormalMatrix: {value: new THREE.Matrix3()}
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        // Light contributes colour, not geometry coverage. This keeps the mask
        // usable when inner and outer light are adjusted independently.
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        polygonOffset: true,
        polygonOffsetFactor: 1.0,
        polygonOffsetUnits: 4.0
    });
}

/** A highlight on the visible surface, sharing the same world-up height mask. */
export function createSurfaceGlowMaterial(geometry, partHeight, texture = null, gradient = {}) {
    if (!geometry.attributes.glowPosition) {
        geometry.setAttribute('glowPosition', geometry.attributes.position.clone());
        geometry.setAttribute('glowNormal', geometry.attributes.normal.clone());
    }
    geometry.computeBoundingBox();
    const material = createGlowMaterial(partHeight, texture, gradient);
    material.defines = {SURFACE_GLOW: 1};
    material.side = THREE.FrontSide;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    material.uniforms.boundsMin = {value: geometry.boundingBox.min.clone()};
    material.uniforms.boundsMax = {value: geometry.boundingBox.max.clone()};
    material.uniforms.rimWidth = {value: 0.8};
    return material;
}

// Cache projected vertex bounds, not rotated local AABBs: bent limbs and sparse
// item silhouettes must use their actual world-space height.
const worldBounds = new WeakMap();

export function updateWorldGlow(layers, sources = layers.slice(0, 1)) {
    if (!layers.length || !layers.some(layer => layer.material.uniforms.opacity.value > 0)) return;
    let minY = Infinity, maxY = -Infinity;
    for (const source of sources) {
        const positions = source.geometry?.attributes.position;
        if (!positions?.count) continue;
        source.updateWorldMatrix(true, false);
        let cached = worldBounds.get(source);
        if (!cached || cached.positions !== positions || cached.version !== positions.version || !cached.matrix.equals(source.matrixWorld)) {
            const m = source.matrixWorld.elements;
            let low = Infinity, high = -Infinity;
            for (let i = 0; i < positions.count; i++) {
                const y = m[1] * positions.getX(i) + m[5] * positions.getY(i) + m[9] * positions.getZ(i) + m[13];
                low = Math.min(low, y);
                high = Math.max(high, y);
            }
            cached = {positions, version: positions.version, matrix: source.matrixWorld.clone(), low, high};
            worldBounds.set(source, cached);
        }
        minY = Math.min(minY, cached.low);
        maxY = Math.max(maxY, cached.high);
    }
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return;
    for (const layer of layers) {
        layer.updateWorldMatrix(true, false);
        const uniforms = layer.material.uniforms;
        uniforms.minY.value = minY;
        uniforms.partHeight.value = Math.max(maxY - minY, 0.0001);
        uniforms.gradientMatrix.value.copy(layer.matrixWorld);
        uniforms.gradientNormalMatrix.value.getNormalMatrix(layer.matrixWorld);
    }
}
