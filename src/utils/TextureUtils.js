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
    for(const [x,y,w,h] of [[0,0,32,16],[16,16,24,16],[40,16,16,16],[0,16,16,16],[16,48,16,16],[32,48,16,16]])ctx.fillRect(x,y,w,h);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}