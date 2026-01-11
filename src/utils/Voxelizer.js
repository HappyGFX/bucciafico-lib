import * as THREE from 'three';

let cachedCanvas = null;
let cachedCtx = null;

function getImageData(image) {
    if (!cachedCanvas) {
        cachedCanvas = document.createElement('canvas');
        cachedCanvas.width = 64;
        cachedCanvas.height = 64;
        cachedCtx = cachedCanvas.getContext('2d', { willReadFrequently: true });
    }

    cachedCtx.clearRect(0, 0, 64, 64);
    cachedCtx.drawImage(image, 0, 0);
    return cachedCtx.getImageData(0, 0, 64, 64).data;
}

const CUBE = {
    vertices: [
        // Right
        0.5, -0.5, 0.5,   0.5, -0.5, -0.5,   0.5, 0.5, -0.5,   0.5, 0.5, 0.5,
        // Left
        -0.5, -0.5, 0.5,  -0.5, 0.5, 0.5,   -0.5, 0.5, -0.5,  -0.5, -0.5, -0.5,
        // Top
        -0.5, 0.5, 0.5,   0.5, 0.5, 0.5,    0.5, 0.5, -0.5,   -0.5, 0.5, -0.5,
        // Bottom
        -0.5, -0.5, 0.5,  -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5, 0.5,
        // Front
        -0.5, -0.5, 0.5,  0.5, -0.5, 0.5,    0.5, 0.5, 0.5,   -0.5, 0.5, 0.5,
        // Back
        -0.5, -0.5, -0.5, -0.5, 0.5, -0.5,   0.5, 0.5, -0.5,   0.5, -0.5, -0.5
    ],
    normals: [
        // Right
        1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
        // Left
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
        // Top
        0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
        // Bottom
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        // Front
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
        // Back
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1
    ],
    indices: [
        0, 1, 2,      0, 2, 3,    // Right
        4, 5, 6,      4, 6, 7,    // Left
        8, 9, 10,     8, 10, 11,  // Top
        12, 13, 14,   12, 14, 15, // Bottom
        16, 17, 18,   16, 18, 19, // Front
        20, 21, 22,   20, 22, 23  // Back
    ]
};

/**
 * Converts the 2nd layer of a skin (Hat, Jacket) into 3D Voxels.
 * Optimized version: Direct buffer manipulation instead of object merging.
 *
 * @param {THREE.Texture} texture
 * @param {Object} layerDef - Definition of UVs and dimensions.
 * @returns {THREE.BufferGeometry|null} Merged geometry of all voxels.
 */
export function createVoxelLayer(texture, layerDef) {
    const imgData = getImageData(texture.image);
    const { outer } = layerDef.uv;
    const { w, h, d } = layerDef.size;

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    let vertexOffset = 0;

    const addVoxel = (cx, cy, cz, sx, sy, sz, u, v) => {
        const uCoord = (u + 0.5) / 64;
        const vCoord = 1.0 - (v + 0.5) / 64;

        for (let i = 0; i < 24; i++) {
            const vx = CUBE.vertices[i * 3] * sx + cx;
            const vy = CUBE.vertices[i * 3 + 1] * sy + cy;
            const vz = CUBE.vertices[i * 3 + 2] * sz + cz;

            positions.push(vx, vy, vz);
            normals.push(CUBE.normals[i * 3], CUBE.normals[i * 3 + 1], CUBE.normals[i * 3 + 2]);
            uvs.push(uCoord, vCoord);
        }

        for (let i = 0; i < CUBE.indices.length; i++) {
            indices.push(CUBE.indices[i] + vertexOffset);
        }
        vertexOffset += 24;
    };

    const faces = [
        // Face 0: Front (Z+)
        {
            u: outer.x + d, v: outer.y + d, width: w, height: h,
            pos: (i, j) => ({ x: i - w/2 + 0.5, y: j - h/2 + 0.5, z: d/2 + 0.25 }),
            scale: { z: 0.5 }
        },
        // Face 1: Back (Z-)
        {
            u: outer.x + d + w + d, v: outer.y + d, width: w, height: h,
            pos: (i, j) => ({ x: -(i - w/2 + 0.5), y: j - h/2 + 0.5, z: -d/2 - 0.25 }),
            scale: { z: 0.5 }
        },
        // Face 2: Right UV / Left 3D (X-)
        {
            u: outer.x, v: outer.y + d, width: d, height: h,
            pos: (i, j) => ({ x: -w/2 - 0.25, y: j - h/2 + 0.5, z: i - d/2 + 0.5 }),
            scale: { x: 0.5 }
        },
        // Face 3: Left UV / Right 3D (X+)
        {
            u: outer.x + d + w, v: outer.y + d, width: d, height: h,
            pos: (i, j) => ({ x: w/2 + 0.25, y: j - h/2 + 0.5, z: -(i - d/2 + 0.5) }),
            scale: { x: 0.5 }
        },
        // Face 4: Top (Y+)
        {
            u: outer.x + d, v: outer.y, width: w, height: d,
            pos: (i, j) => ({ x: i - w/2 + 0.5, y: h/2 + 0.25, z: -(j - d/2 + 0.5) }),
            scale: { y: 0.5 }
        },
        // Face 5: Bottom (Y-)
        {
            u: outer.x + d + w, v: outer.y, width: w, height: d,
            pos: (i, j) => ({ x: i - w/2 + 0.5, y: -h/2 - 0.25, z: (d - 1 - j) - d/2 + 0.5 }),
            scale: { y: 0.5 }
        }
    ];

    faces.forEach(f => {
        for (let i = 0; i < f.width; i++) {
            for (let j = 0; j < f.height; j++) {
                const u = f.u + i;
                const v = f.v + j;

                const alphaIndex = (v * 64 + u) * 4 + 3;
                if (imgData[alphaIndex] > 0) {
                    const pos = f.pos(i, (f.height - 1) - j);
                    const sx = f.scale?.x ?? 1;
                    const sy = f.scale?.y ?? 1;
                    const sz = f.scale?.z ?? 1;
                    addVoxel(pos.x, pos.y, pos.z, sx, sy, sz, u, v);
                }
            }
        }
    });

    if (positions.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    return geometry;
}