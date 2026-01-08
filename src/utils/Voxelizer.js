import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Converts the 2nd layer of a skin (Hat, Jacket) into 3D Voxels.
 * This gives the skin actual depth instead of flat planes.
 * @param {THREE.Texture} texture
 * @param {Object} layerDef - Definition of UVs and dimensions.
 * @returns {THREE.BufferGeometry|null} Merged geometry of all voxels.
 */
export function createVoxelLayer(texture, layerDef) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(texture.image, 0, 0);
    const imgData = ctx.getImageData(0, 0, 64, 64).data;

    const geometries = [];
    const { outer } = layerDef.uv;
    const { w, h, d } = layerDef.size;

    // Mapping faces of the body part to UV coordinates
    const faces = [
        { u: outer.x+d, v: outer.y+d, w: w, h: h, pos: (i,j) => new THREE.Vector3(i-w/2+0.5, j-h/2+0.5, d/2+0.25) },
        { u: outer.x+d+w+d, v: outer.y+d, w: w, h: h, pos: (i,j) => new THREE.Vector3(-(i-w/2+0.5), j-h/2+0.5, -d/2-0.25) },
        { u: outer.x, v: outer.y+d, w: d, h: h, pos: (i,j) => new THREE.Vector3(-w/2-0.25, j-h/2+0.5, i-d/2+0.5), sx: 0.5 },
        { u: outer.x+d+w, v: outer.y+d, w: d, h: h, pos: (i,j) => new THREE.Vector3(w/2+0.25, j-h/2+0.5, -(i-d/2+0.5)), sx: 0.5 },
        { u: outer.x+d, v: outer.y, w: w, h: d, pos: (i,j) => new THREE.Vector3(i-w/2+0.5, h/2+0.25, -(j-d/2+0.5)), sy: 0.5 },
        { u: outer.x+d+w, v: outer.y, w: w, h: d, pos: (i,j) => new THREE.Vector3(i-w/2+0.5, -h/2-0.25, (d - 1 - j) - d/2 + 0.5), sy: 0.5 }
    ];

    const baseGeo = new THREE.BoxGeometry(1, 1, 1);

    faces.forEach(f => {
        for(let i=0; i<f.w; i++) {
            for(let j=0; j<f.h; j++) {
                const u = f.u + i;
                const v = f.v + j;

                if(imgData[(v*64+u)*4+3] > 0) {
                    const geo = baseGeo.clone();

                    const uvAttr = geo.attributes.uv;
                    for(let k=0; k<uvAttr.count; k++) uvAttr.setXY(k, (u+0.5)/64, 1.0-(v+0.5)/64);

                    const m = new THREE.Matrix4();
                    const scale = new THREE.Vector3(f.sx||1, f.sy||1, f.sz||1);
                    if(f === faces[0] || f === faces[1]) scale.z = 0.5;
                    m.compose(f.pos(i, (f.h-1)-j), new THREE.Quaternion(), scale);
                    geo.applyMatrix4(m);
                    geometries.push(geo);
                }
            }
        }
    });

    return geometries.length > 0 ? BufferGeometryUtils.mergeGeometries(geometries) : null;
}