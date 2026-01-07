import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static factory to generate 3D extruded meshes from 2D item textures.
 */
export class ItemFactory {
    /**
     * Loads a texture and creates an extruded mesh.
     * @param {string} url - Image URL.
     * @param {string} name - Item name.
     * @returns {Promise<THREE.Mesh>}
     */
    static createFromURL(url, name) {
        return new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(url, (texture) => {
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                texture.colorSpace = THREE.SRGBColorSpace;
                const mesh = this.generateMesh(texture);
                if(mesh) {
                    mesh.name = name;
                    resolve(mesh);
                } else {
                    reject("Error generating geometry");
                }
            }, undefined, reject);
        });
    }

    /**
     * Generates geometry by iterating over pixels and creating voxels for non-transparent ones.
     */
    static generateMesh(texture) {
        const img = texture.image;
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        const geometries = [];
        const baseGeo = new THREE.BoxGeometry(1, 1, 1);

        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                // Check Alpha > 10
                if (data[(y * img.width + x) * 4 + 3] > 10) {
                    const geo = baseGeo.clone();
                    const matrix = new THREE.Matrix4().makeTranslation((x - img.width/2), ((img.height-1-y) - img.height/2), 0);
                    geo.applyMatrix4(matrix);

                    // Map UVs for this single voxel
                    const uvAttr = geo.attributes.uv;
                    for(let i=0; i<uvAttr.count; i++) {
                        uvAttr.setXY(i, (x+0.5)/img.width, 1.0-(y+0.5)/img.height);
                    }
                    geometries.push(geo);
                }
            }
        }

        if (geometries.length === 0) return null;

        const merged = BufferGeometryUtils.mergeGeometries(geometries);
        merged.center();

        const mat = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(merged, mat);

        // Scale to match Minecraft pixel density roughly
        const scale = 16 / Math.max(img.width, img.height);
        mesh.scale.set(scale, scale, scale);

        mesh.userData.originalMat = mat;
        return mesh;
    }
}