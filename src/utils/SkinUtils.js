/**
 * Calculates UV coordinates for standard Minecraft skin layout.
 */
export function getUV(x, y, w, h) {
    const imgW = 64;
    const imgH = 64;
    return { u0: x/imgW, u1: (x+w)/imgW, v0: (imgH-y-h)/imgH, v1: (imgH-y)/imgH };
}

/**
 * Maps UV coordinates to a box geometry (Cube mapping).
 */
export function applySkinUVs(geometry, x, y, w, h, d) {
    const uvAttr = geometry.attributes.uv;

    /**
     * Helper to map a single face.
     * @param {number} idx - Face index (0-5).
     * @param {number} uX - Texture X.
     * @param {number} uY - Texture Y.
     * @param {number} uW - Texture Width.
     * @param {number} uH - Texture Height.
     * @param {boolean} flipX - Mirror horizontally.
     * @param {boolean} flipY - Mirror vertically.
     */
    const map = (idx, uX, uY, uW, uH, flipX = false, flipY = false) => {
        const uv = getUV(uX, uY, uW, uH);
        const i = idx * 4;

        // Handle flipping
        const u0 = flipX ? uv.u1 : uv.u0;
        const u1 = flipX ? uv.u0 : uv.u1;
        const v0 = flipY ? uv.v1 : uv.v0;
        const v1 = flipY ? uv.v0 : uv.v1;

        uvAttr.setXY(i+0, u0, v1);
        uvAttr.setXY(i+1, u1, v1);
        uvAttr.setXY(i+2, u0, v0);
        uvAttr.setXY(i+3, u1, v0);
    };

    map(0, x + d + w, y + d, d, h); // Right
    map(1, x, y + d, d, h); // Left
    map(2, x + d, y, w, d); // Top
    map(3, x + d + w, y, w, d, false, true); // Bottom
    map(4, x + d, y + d, w, h); // Front
    map(5, x + d + w + d, y + d, w, h); // Back

    uvAttr.needsUpdate = true;
}

/**
 * Detects if a skin is Slim (Alex model) by checking the pixel at (55, 20).
 * If transparent, it's Slim. If opaque, it's Classic.
 * @param {HTMLImageElement} image
 * @returns {boolean} True if Slim.
 */
export function detectSlimSkin(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    // Check specific pixel transparency
    return ctx.getImageData(55, 20, 1, 1).data[3] === 0;
}