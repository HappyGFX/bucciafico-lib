import * as THREE from 'three';
import { applySkinUVs } from './SkinUtils.js';

function pixels(image) {
    if (image?.data) return image.data;
    if (!image) return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, 64, 64).data;
}

/** Extrude individual nontransparent texels, using the base mesh's exact face orientation. */
export function createVoxelLayer(texture, { uv: { outer }, size: { w, h, d } }) {
    const data = pixels(texture.image);
    if (!data) return null;
    const box = new THREE.BoxGeometry(w, h, d);
    applySkinUVs(box, outer.x, outer.y, w, h, d);
    const positions = [], normals = [], uvs = [], indices = [];
    const p = box.attributes.position, uv = box.attributes.uv;
    const dimensions = [[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
    for (let face = 0; face < 6; face++) {
        const start = face * 4, [width,height] = dimensions[face];
        const origin = new THREE.Vector3().fromBufferAttribute(p,start);
        const across = new THREE.Vector3().fromBufferAttribute(p,start+1).sub(origin).divideScalar(width);
        const down = new THREE.Vector3().fromBufferAttribute(p,start+2).sub(origin).divideScalar(height);
        const normal = new THREE.Vector3().fromBufferAttribute(box.attributes.normal,start);
        const sample = (i,j) => {
            const x=(i+.5)/width, y=(j+.5)/height;
            const u=uv.getX(start)+(uv.getX(start+1)-uv.getX(start))*x;
            const v=uv.getY(start)+(uv.getY(start+2)-uv.getY(start))*y;
            return {u,v,alpha:data[(Math.floor((1-v)*64)*64+Math.floor(u*64))*4+3]};
        };
        const voxel = new THREE.BoxGeometry(normal.x ? .5 : 1,normal.y ? .5 : 1,normal.z ? .5 : 1);
        for(let j=0;j<height;j++) for(let i=0;i<width;i++) {
            const texel=sample(i,j);
            if(!texel.alpha) continue;
            // Slight clearance prevents the inner voxel face fighting with the base skin.
            const center=origin.clone().addScaledVector(across,i+.5).addScaledVector(down,j+.5).addScaledVector(normal,.26);
            for(let side=0;side<6;side++) {
                const n=new THREE.Vector3().fromBufferAttribute(voxel.attributes.normal,side*4);
                const di=Math.round(n.dot(across)), dj=Math.round(n.dot(down));
                // Adjacent opaque pixels share no visible internal wall.
                if((di||dj)&&i+di>=0&&i+di<width&&j+dj>=0&&j+dj<height&&texel.alpha===255&&sample(i+di,j+dj).alpha===255) continue;
                const offset=positions.length/3;
                for(let k=0;k<4;k++) {
                    const point=new THREE.Vector3().fromBufferAttribute(voxel.attributes.position,side*4+k).add(center);
                    positions.push(point.x,point.y,point.z);normals.push(n.x,n.y,n.z);uvs.push(texel.u,texel.v);
                }
                indices.push(offset,offset+2,offset+1,offset+2,offset+3,offset+1);
            }
        }
        voxel.dispose();
    }
    box.dispose();
    if(!positions.length) return null;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(indices);
    return geometry;
}
