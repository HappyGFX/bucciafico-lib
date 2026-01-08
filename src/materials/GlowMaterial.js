import * as THREE from 'three';

const vertexShader = `
    uniform float thickness;
    varying float vY;
    varying vec3 vNormal;
    void main() {
        vNormal = normal;
        vec3 newPos = position + normal * thickness;
        vY = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
    }
`;

const fragmentShader = `
    uniform float opacity;
    uniform float gradientLimit;
    uniform float partHeight;
    varying float vY;
    varying vec3 vNormal;
    void main() {
        if (opacity <= 0.01) discard;
        if (vNormal.y < -0.9) discard;
        
        float normalizedY = (vY + (partHeight / 2.0)) / partHeight;
        float alpha = smoothstep(1.0 - gradientLimit, 1.0, normalizedY);
        alpha *= smoothstep(0.0, 0.2, normalizedY);
        
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * opacity);
    }
`;

/**
 * Creates a ShaderMaterial for the glow effect.
 * It renders a larger, back-side version of the mesh with an opacity gradient.
 * @param {number} partHeight - Height of the body part for gradient calculation.
 */
export function createGlowMaterial(partHeight) {
    return new THREE.ShaderMaterial({
        uniforms: {
            opacity: { value: 0.0 },
            gradientLimit: { value: 0.8 },
            thickness: { value: 0.0 },
            partHeight: { value: partHeight }
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: 1.0,
        polygonOffsetUnits: 4.0
    });
}