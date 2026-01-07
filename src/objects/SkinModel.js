import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySkinUVs } from '../utils/SkinUtils.js';
import { createVoxelLayer } from '../utils/Voxelizer.js';
import { createGlowMaterial } from '../materials/GlowMaterial.js';

/**
 * Represents the Minecraft Character Model (Steve/Alex).
 * Handles geometry generation, UV mapping, and hierarchy.
 */
export class SkinModel {
    constructor() {
        this.playerGroup = new THREE.Group();
        this.parts = {};
        this.glowMeshes = [];
        this.bodyMeshes = [];
        this.defaultPositions = {};
        this.blackMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    }

    /**
     * Creates a single body part (e.g., Head, Arm).
     * Adds Inner layer (Box), Outer layer (Voxels), and Glow mesh.
     */
    createBodyPart(texture, coords, size, pivotPos, meshOffset, name) {
        const pivotGroup = new THREE.Group();
        pivotGroup.position.copy(pivotPos);
        pivotGroup.name = name;
        this.defaultPositions[name] = pivotPos.clone();

        const meshGroup = new THREE.Group();
        meshGroup.position.copy(meshOffset);

        // 1. Inner Layer (Standard Box)
        const innerGeo = new THREE.BoxGeometry(size.w, size.h, size.d);
        applySkinUVs(innerGeo, coords.inner.x, coords.inner.y, size.w, size.h, size.d);
        const innerMat = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: false, // Opaque for correct depth sorting
            alphaTest: 0.5
        });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        innerMesh.userData.originalMat = innerMat;
        meshGroup.add(innerMesh);
        this.bodyMeshes.push(innerMesh);

        // 2. Outer Layer (Voxelized 2nd Layer)
        const voxelGeo = createVoxelLayer(texture, { uv: coords, size: size });
        if (voxelGeo) {
            const outerMat = new THREE.MeshStandardMaterial({
                map: texture,
                transparent: false,
                alphaTest: 0.5,
                side: THREE.FrontSide
            });
            const voxelMesh = new THREE.Mesh(voxelGeo, outerMat);
            voxelMesh.userData.originalMat = outerMat;
            meshGroup.add(voxelMesh);
            this.bodyMeshes.push(voxelMesh);
        }

        // 3. Glow Mesh (Copy of geometry for shader)
        const glowParts = [innerGeo.clone()];
        if (voxelGeo) glowParts.push(voxelGeo.clone());
        const glowGeo = BufferGeometryUtils.mergeGeometries(glowParts, false);
        const glowMat = createGlowMaterial(size.h);
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.userData.glowMat = glowMat;
        this.glowMeshes.push(glowMesh);
        meshGroup.add(glowMesh);

        pivotGroup.add(meshGroup);
        return pivotGroup;
    }

    /**
     * Builds the entire character model from a texture.
     * @param {THREE.Texture} texture
     * @param {boolean} isSlim - True for Alex model (3px arms), False for Steve (4px arms).
     */
    build(texture, isSlim = false) {
        this.playerGroup.clear();
        this.parts = {};
        this.glowMeshes = [];
        this.bodyMeshes = [];
        this.defaultPositions = {};

        const armW = isSlim ? 3 : 4;
        const armOff = isSlim ? 5.0 : 6.0;

        const defs = {
            head: { uv: { inner: {x:0, y:0}, outer: {x:32, y:0} }, size: { w:8, h:8, d:8 }, pivotPos: new THREE.Vector3(0, 0, 0), meshOffset: new THREE.Vector3(0, 4, 0) },
            body: { uv: { inner: {x:16, y:16}, outer: {x:16, y:32} }, size: { w:8, h:12, d:4 }, pivotPos: new THREE.Vector3(0, 0, 0), meshOffset: new THREE.Vector3(0, -6, 0) },
            rightArm: { uv: { inner: {x:40, y:16}, outer: {x:40, y:32} }, size: { w:armW, h:12, d:4 }, pivotPos: new THREE.Vector3(-armOff, -2, 0), meshOffset: new THREE.Vector3(0, -4, 0) },
            leftArm: { uv: { inner: {x:32, y:48}, outer: {x:48, y:48} }, size: { w:armW, h:12, d:4 }, pivotPos: new THREE.Vector3(armOff, -2, 0), meshOffset: new THREE.Vector3(0, -4, 0) },
            rightLeg: { uv: { inner: {x:0, y:16}, outer: {x:0, y:32} }, size: { w:4, h:12, d:4 }, pivotPos: new THREE.Vector3(-1.9, -12, 0), meshOffset: new THREE.Vector3(0, -6, 0) },
            leftLeg: { uv: { inner: {x:16, y:48}, outer: {x:0, y:48} }, size: { w:4, h:12, d:4 }, pivotPos: new THREE.Vector3(1.9, -12, 0), meshOffset: new THREE.Vector3(0, -6, 0) }
        };

        for (const [name, def] of Object.entries(defs)) {
            const part = this.createBodyPart(texture, def.uv, def.size, def.pivotPos, def.meshOffset, name);
            this.parts[name] = part;
            this.playerGroup.add(part);
        }
    }

    getGroup() { return this.playerGroup; }

    updateBorderThickness(v) { const t = v * 0.05; this.glowMeshes.forEach(m => m.userData.glowMat.uniforms.thickness.value = t); }
    updateGlowHeight(p) { this.glowMeshes.forEach(m => m.userData.glowMat.uniforms.gradientLimit.value = p); }
    setGlowEffect(en) { this.glowMeshes.forEach(m => m.userData.glowMat.uniforms.opacity.value = en ? 1.0 : 0.0); }
    darkenBody() { this.bodyMeshes.forEach(m => m.material = this.blackMaterial); }
    restoreBody() { this.bodyMeshes.forEach(m => m.material = m.userData.originalMat); }

    setPose(pose) {
        for (const [name, part] of Object.entries(this.parts)) {
            part.rotation.set(0,0,0);
            if (this.defaultPositions[name]) part.position.copy(this.defaultPositions[name]);
        }
        if (!pose) return;
        for (const [name, data] of Object.entries(pose)) {
            if (this.parts[name]) {
                if(data.rot) this.parts[name].rotation.set(...data.rot);
                if(data.pos) this.parts[name].position.set(...data.pos);
            }
        }
    }

    getPose() {
        const pose = {};
        const f = (n) => parseFloat(n.toFixed(3));
        for (const [name, part] of Object.entries(this.parts)) {
            pose[name] = { rot: [f(part.rotation.x), f(part.rotation.y), f(part.rotation.z)], pos: [f(part.position.x), f(part.position.y), f(part.position.z)] };
        }
        return pose;
    }
}