/**
 * Recursively disposes of a Three.js object and its children.
 * Frees memory for Geometries, Materials, and Textures.
 * @param {THREE.Object3D} object - The object to clean up.
 */
export function disposeObjectTree(object, {textures = true} = {}) {
    if (!object) return;
    if (object.userData.resourceRelease) {
        object.userData.resourceRelease();
        return;
    }
    const managed = [];
    object.traverse(c => {
        if (c !== object && c.userData.resourceRelease) managed.push(c);
    });
    for (const c of managed) {
        c.removeFromParent();
        c.userData.resourceRelease();
    }

    object.traverse((child) => {
        for (const material of [child.userData.darkMat].flat()) material?.dispose();
        if (child.geometry) {
            child.geometry.dispose();
        }

        if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];

            materials.forEach((mat) => {
                for (const key in mat) {
                    if (textures && mat[key] && mat[key].isTexture) {
                        mat[key].dispose();
                    }
                }
                mat.dispose();
            });
        }
    });
}