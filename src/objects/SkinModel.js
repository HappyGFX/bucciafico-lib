import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySkinUVs } from '../utils/SkinUtils.js';
import { createVoxelLayer } from '../utils/Voxelizer.js';
import { createGlowMaterial } from '../materials/GlowMaterial.js';
import {disposeObjectTree} from "../utils/ThreeUtils.js";

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

        this.LAYERS_COUNT = 20;
    }

    /**
     * Creates a single body part (e.g., Head, Arm).
     * Adds Inner layer (Box), Outer layer (Voxels), and Glow mesh.
     */
    createBodyPart(texture, coords, size, pivotPos, meshOffset, name, renderVoxels = true) {
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
        let voxelGeo = null;
        if (renderVoxels) {
            voxelGeo = createVoxelLayer(texture, { uv: coords, size: size });
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
        }

        // 3. Glow Meshes (Multi-Layer Shells)
        const glowParts = [innerGeo.clone()];
        if (voxelGeo) glowParts.push(voxelGeo.clone());
        const baseGlowGeo = BufferGeometryUtils.mergeGeometries(glowParts, false);

        const partLayers = [];

        for (let i = 0; i < this.LAYERS_COUNT; i++) {
            const glowMat = createGlowMaterial(size.h);

            glowMat.uniforms.thickness.value = 0;
            glowMat.uniforms.opacity.value = 0;

            const layerMesh = new THREE.Mesh(baseGlowGeo, glowMat);

            layerMesh.userData.layerIndex = i;
            layerMesh.userData.isGlow = true;
            layerMesh.userData.glowMat = glowMat;

            meshGroup.add(layerMesh);
            partLayers.push(layerMesh);
        }

        this.glowMeshes.push(partLayers);

        pivotGroup.add(meshGroup);
        return pivotGroup;
    }

    /**
     * Builds the entire character model from a texture.
     * @param {THREE.Texture} texture
     * @param {boolean} [isSlim=false] - True for Alex model (3px arms), False for Steve (4px arms).
     * @param {boolean} [renderVoxels=true] - Whether to generate the outer voxel layer.
     */
    build(texture, isSlim = false, renderVoxels = true) {
        if (!this.playerGroup) return;

        let capeBackup = null;
        if (this.parts.cape) {
            const mesh = this.parts.cape.children.find(c => c.isMesh);
            if (mesh && mesh.material.map) {
                capeBackup = {
                    texture: mesh.material.map,
                    position: this.parts.cape.position.clone(),
                    rotation: this.parts.cape.rotation.clone(),
                    scale: this.parts.cape.scale.clone()
                };
                this.parts.cape.traverse(obj => {
                    if (obj.isMesh && obj.material.map && !capeBackup.texture) {
                        capeBackup.texture = obj.material.map;
                    }
                });
            }
        }

        if (this.playerGroup.children.length > 0) {
            disposeObjectTree(this.playerGroup);
            this.playerGroup.clear();
        }

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
            const part = this.createBodyPart(
                texture,
                def.uv,
                def.size,
                def.pivotPos,
                def.meshOffset,
                name,
                renderVoxels
            );
            this.parts[name] = part;
            this.playerGroup.add(part);
        }

        if (capeBackup && capeBackup.texture) {
            this.setCape(capeBackup.texture);

            if (this.parts.cape) {
                this.parts.cape.position.copy(capeBackup.position);
                this.parts.cape.rotation.copy(capeBackup.rotation);
                this.parts.cape.scale.copy(capeBackup.scale);
            }
        }
    }

    /**
     * Adds or updates the Cape mesh.
     * @param {THREE.Texture} texture
     */
    setCape(texture) {
        if (!this.playerGroup) return;

        let prevTransform = null;

        if (this.parts.cape) {
            prevTransform = {
                pos: this.parts.cape.position.clone(),
                rot: this.parts.cape.rotation.clone(),
                scl: this.parts.cape.scale.clone()
            };

            if (this.parts.cape.userData.glowLayers) {
                const layersToRemove = this.parts.cape.userData.glowLayers;
                this.glowMeshes = this.glowMeshes.filter(layers => layers !== layersToRemove);
            }

            this.playerGroup.remove(this.parts.cape);
            disposeObjectTree(this.parts.cape);
            delete this.parts.cape;
        }

        if (!texture) return;

        const size = { w: 10, h: 16, d: 1 };
        const pivotPos = new THREE.Vector3(0, 0, -3);
        const meshOffset = new THREE.Vector3(0, -8, 0.6);

        const pivotGroup = new THREE.Group();

        pivotGroup.position.copy(pivotPos);
        pivotGroup.name = 'cape';
        pivotGroup.rotation.x = 0.2;

        this.defaultPositions['cape'] = pivotPos.clone();

        const geo = new THREE.BoxGeometry(size.w, size.h, size.d);
        applySkinUVs(geo, 0, 0, 10, 16, 1, 64, 32);

        const mat = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.5
        });

        const mainMesh = new THREE.Mesh(geo, mat);
        mainMesh.position.copy(meshOffset);
        mainMesh.rotation.y = Math.PI;
        mainMesh.userData.originalMat = mat;

        pivotGroup.add(mainMesh);
        this.bodyMeshes.push(mainMesh);

        const capeLayers = [];
        const shellGeo = geo.clone();

        for (let i = 0; i < this.LAYERS_COUNT; i++) {
            const glowMat = createGlowMaterial(size.h);

            glowMat.uniforms.thickness.value = 0;
            glowMat.uniforms.opacity.value = 0;
            glowMat.polygonOffset = true;
            glowMat.polygonOffsetFactor = i * 0.1;

            const layerMesh = new THREE.Mesh(shellGeo, glowMat);

            layerMesh.position.copy(meshOffset);
            layerMesh.rotation.y = Math.PI;

            layerMesh.userData.layerIndex = i;
            layerMesh.userData.isGlow = true;
            layerMesh.userData.glowMat = glowMat;

            pivotGroup.add(layerMesh);
            capeLayers.push(layerMesh);
        }

        this.glowMeshes.push(capeLayers);
        pivotGroup.userData.glowLayers = capeLayers;

        if (prevTransform) {
            pivotGroup.position.copy(prevTransform.pos);
            pivotGroup.rotation.copy(prevTransform.rot);
            pivotGroup.scale.copy(prevTransform.scl);
        }

        this.playerGroup.add(pivotGroup);
        this.parts['cape'] = pivotGroup;
    }

    getGroup() { return this.playerGroup; }

    /**
     * Updates thickness creating a solid volume effect.
     * @param {number} v - Base thickness value.
     */
    updateBorderThickness(v) {
        const maxThickness = v * 0.05;

        this.glowMeshes.forEach(layers => {
            layers.forEach((mesh, i) => {
                const progress = (i + 1) / this.LAYERS_COUNT;

                mesh.userData.glowMat.uniforms.thickness.value = maxThickness * progress;
            });
        });
    }

    updateGlowHeight(p) {
        this.glowMeshes.forEach(layers => {
            layers.forEach(m => m.userData.glowMat.uniforms.gradientLimit.value = p);
        });
    }

    setGlowEffect(en) {
        this.glowMeshes.forEach(layers => {
            layers.forEach((mesh, i) => {
                if (!en) {
                    mesh.userData.glowMat.uniforms.opacity.value = 0.0;
                } else {
                    mesh.userData.glowMat.uniforms.opacity.value = 1.0 / (this.LAYERS_COUNT * 0.6);
                }
            });
        });
    }

    darkenBody() { this.bodyMeshes.forEach(m => m.material = this.blackMaterial); }
    restoreBody() { this.bodyMeshes.forEach(m => m.material = m.userData.originalMat); }

    /**
     * Applies a pose to the model.
     * Resets to default T-pose first, then applies changes.
     * @param {Object} pose
     */
    setPose(pose) {
        for (const [name, part] of Object.entries(this.parts)) {
            part.rotation.set(0, 0, 0);
            part.scale.set(1, 1, 1); // Reset scale
            if (this.defaultPositions[name]) {
                part.position.copy(this.defaultPositions[name]);
            }
        }

        this.playerGroup.position.set(0, 0, 0);
        this.playerGroup.rotation.set(0, 0, 0);
        this.playerGroup.scale.set(1, 1, 1);

        if (!pose) return;

        if (pose.root) {
            if (pose.root.pos) this.playerGroup.position.fromArray(pose.root.pos);
            if (pose.root.rot) this.playerGroup.rotation.fromArray(pose.root.rot);
            if (pose.root.scl) this.playerGroup.scale.fromArray(pose.root.scl);
        }

        for (const [name, data] of Object.entries(pose)) {
            if (name === 'root') continue;

            if (this.parts[name]) {
                if (data.rot) this.parts[name].rotation.set(...data.rot);
                if (data.pos) this.parts[name].position.set(...data.pos);
                if (data.scl) this.parts[name].scale.set(...data.scl); // Added Scale support
            }
        }
    }

    /**
     * Generates a JSON representation of the current pose.
     * Optimized: Does not export default values (0,0,0 position/rotation or 1,1,1 scale).
     */
    getPose() {
        if (!this.playerGroup) return {};

        const pose = {};
        const f = (n) => parseFloat(n.toFixed(3));

        const isZero = (arr) => arr[0] === 0 && arr[1] === 0 && arr[2] === 0;
        const isOne = (arr) => arr[0] === 1 && arr[1] === 1 && arr[2] === 1;

        for (const [name, part] of Object.entries(this.parts)) {
            const rot = [f(part.rotation.x), f(part.rotation.y), f(part.rotation.z)];
            const pos = [f(part.position.x), f(part.position.y), f(part.position.z)];
            const scl = [f(part.scale.x), f(part.scale.y), f(part.scale.z)];

            const partData = {};

            if (!isZero(rot)) partData.rot = rot;
            partData.pos = pos;

            if (!isOne(scl)) partData.scl = scl;

            if (Object.keys(partData).length > 0) {
                pose[name] = partData;
            }
        }

        const rPos = [f(this.playerGroup.position.x), f(this.playerGroup.position.y), f(this.playerGroup.position.z)];
        const rRot = [f(this.playerGroup.rotation.x), f(this.playerGroup.rotation.y), f(this.playerGroup.rotation.z)];
        const rScl = [f(this.playerGroup.scale.x), f(this.playerGroup.scale.y), f(this.playerGroup.scale.z)];

        const rootData = {};
        if (!isZero(rPos)) rootData.pos = rPos;
        if (!isZero(rRot)) rootData.rot = rRot;
        if (!isOne(rScl)) rootData.scl = rScl;

        if (Object.keys(rootData).length > 0) {
            pose.root = rootData;
        }

        return pose;
    }

    dispose() {
        if (this.playerGroup) {
            if (this.playerGroup.parent) {
                this.playerGroup.parent.remove(this.playerGroup);
            }
            disposeObjectTree(this.playerGroup);
        }

        this.parts = {};
        this.glowMeshes = [];
        this.bodyMeshes = [];
        this.playerGroup = null;
    }
}