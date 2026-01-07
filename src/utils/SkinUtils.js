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
    const map = (idx, uX, uY, uW, uH) => {
        const uv = getUV(uX, uY, uW, uH);
        const i = idx * 4;
        // Standard UV mapping for cube face
        uvAttr.setXY(i+0, uv.u0, uv.v1);
        uvAttr.setXY(i+1, uv.u1, uv.v1);
        uvAttr.setXY(i+2, uv.u0, uv.v0);
        uvAttr.setXY(i+3, uv.u1, uv.v0);
    };

    // Order: Right, Left, Top, Bottom, Front, Back
    map(0, x + d + w, y + d, d, h);
    map(1, x, y + d, d, h);
    map(2, x + d, y, w, d);
    map(3, x + d + w, y, w, d);
    map(4, x + d, y + d, w, h);
    map(5, x + d + w + d, y + d, w, h);
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