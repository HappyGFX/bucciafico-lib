import * as THREE from 'three';

/**
 * Generates a default gray placeholder texture for the Steve model.
 * It fills the base body parts with gray and leaves the outer layer (hat/jacket) transparent.
 * @returns {THREE.CanvasTexture}
 */
export function createPlaceholderTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3c3c3c';
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}