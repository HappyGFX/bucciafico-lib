/**
 * Calculates UV coordinates for standard Minecraft skin layout.
 */
export function getUV(x, y, w, h, imgW = 64, imgH = 64) {
    return {
        u0: x / imgW,
        u1: (x + w) / imgW,
        v0: (imgH - y - h) / imgH,
        v1: (imgH - y) / imgH
    };
}

/**
 * Maps UV coordinates to a box geometry (Cube mapping).
 * @param {THREE.BufferGeometry} geometry
 * @param {number} x - Texture X
 * @param {number} y - Texture Y
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {number} d - Depth
 * @param {number} [imgW=64] - Texture Width
 * @param {number} [imgH=64] - Texture Height
 */
export function applySkinUVs(geometry, x, y, w, h, d, imgW = 64, imgH = 64) {
    const uvAttr = geometry.attributes.uv;

    const map = (idx, uX, uY, uW, uH, flipX = false, flipY = false) => {
        const uv = getUV(uX, uY, uW, uH, imgW, imgH);
        const i = idx * 4;

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

/** Infer Alex only when both unused arm strips are transparent. Manual override is available. */
export function detectSlimSkin(image) {
    if(image.height===32)return false;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    return [[54,20],[46,52]].every(([x,y])=>{
        const data=ctx.getImageData(x,y,2,12).data;
        return data.every((v,i)=>i%4!==3||v===0);
    });
}
