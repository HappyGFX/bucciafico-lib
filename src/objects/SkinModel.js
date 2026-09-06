import * as THREE from 'three';
import {createVoxelLayer} from '../utils/Voxelizer.js';
import {applySkinUVs} from '../utils/SkinUtils.js';
import {createGlowMaterial, updateWorldGlow} from '../materials/GlowMaterial.js';
import {disposeObjectTree} from "../utils/ThreeUtils.js";
import {JointBinding, JOINTS} from "./BoneRig.js";

/**
 * Represents the Minecraft Character Model (Steve/Alex).
 * Handles geometry generation, UV mapping, and hierarchy.
 */
export class SkinModel {
    constructor() {
        this.playerGroup = new THREE.Group();
        this.parts = {};
        this.visibility = {base: true, outer: true, parts: {}, outerParts: {}};
        this.jointBindings = [];
        this.glowMeshes = [];
        this.bodyMeshes = [];
        this.defaultPositions = {};
        this.blackMaterial = new THREE.MeshBasicMaterial({color: 0x000000});

        this.LAYERS_COUNT = 20;
    }

    /**
     * Creates a single body part (e.g., Head, Arm).
     * Adds Inner layer (Box), Outer layer (Voxels), and Glow mesh.
     */
    createBodyPart(texture, coords, size, pivotPos, meshOffset, name, renderVoxels = true) {
        const pivot = new THREE.Bone();
        pivot.name = name;
        pivot.position.copy(pivotPos);
        this.defaultPositions[name] = pivotPos.clone();
        const meshGroup = new THREE.Group();
        meshGroup.position.copy(meshOffset);
        pivot.add(meshGroup);
        for (const layer of (renderVoxels ? ['base', 'outer'] : ['base'])) {
            const uv = layer === 'base' ? coords.inner : coords.outer;
            const geometry = layer === 'outer'
                ? createVoxelLayer(texture, {uv: coords, size})
                : new THREE.BoxGeometry(size.w, size.h, size.d);
            if (!geometry) continue;
            if (layer === 'base') applySkinUVs(geometry, uv.x, uv.y, size.w, size.h, size.d);
            // Extruded pixels must occlude their rear walls and neighbouring body parts.
            // Alpha testing keeps empty texels clear without disabling depth writes.
            const material = new THREE.MeshStandardMaterial({
                map: texture,
                transparent: true,
                alphaTest: 1 / 255,
                side: THREE.DoubleSide,
                depthWrite: true
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData = {originalMat: material, skinPart: name, skinLayer: layer};
            meshGroup.add(mesh);
            this.bodyMeshes.push(mesh);
            const shells = [];
            for (let i = 0; i < this.LAYERS_COUNT; i++) {
                const glowMat = createGlowMaterial(size.h, texture);
                const shell = new THREE.Mesh(geometry, glowMat);
                shell.userData = {layerIndex: i, isGlow: true, glowMat, skinPart: name, skinLayer: layer};
                meshGroup.add(shell);
                shells.push(shell);
            }
            this.glowMeshes.push(shells);
        }
        return pivot;
    }

    /**
     * Builds the entire character model from a texture.
     * @param {THREE.Texture} texture
     * @param {boolean} [isSlim=false] - True for Alex model (3px arms), False for Steve (4px arms).
     * @param {boolean} [renderVoxels=true] - Whether to generate the outer voxel layer.
     */
    build(texture, isSlim = false, renderVoxels = true) {
        if (!this.playerGroup) return;
        const oldTexture = this.texture;
        this.texture = texture;
        this.isSlim = isSlim;

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
            disposeObjectTree(this.playerGroup, {textures: false});
            this.playerGroup.clear();
        }

        this.parts = {};
        this.glowMeshes = [];
        this.bodyMeshes = [];
        this.defaultPositions = {};

        this.jointBindings = [];
        const armW = isSlim ? 3 : 4;
        const armOff = isSlim ? 5.5 : 6.0;

        const defs = {
            head: {
                uv: {inner: {x: 0, y: 0}, outer: {x: 32, y: 0}},
                size: {w: 8, h: 8, d: 8},
                pivotPos: new THREE.Vector3(0, 0, 0),
                meshOffset: new THREE.Vector3(0, 4, 0)
            },
            body: {
                uv: {inner: {x: 16, y: 16}, outer: {x: 16, y: 32}},
                size: {w: 8, h: 12, d: 4},
                pivotPos: new THREE.Vector3(0, -6, 0),
                meshOffset: new THREE.Vector3(0, 0, 0)
            },
            rightArm: {
                uv: {inner: {x: 40, y: 16}, outer: {x: 40, y: 32}},
                size: {w: armW, h: 12, d: 4},
                pivotPos: new THREE.Vector3(-armOff, -2, 0),
                meshOffset: new THREE.Vector3(0, -4, 0)
            },
            leftArm: {
                uv: {inner: {x: 32, y: 48}, outer: {x: 48, y: 48}},
                size: {w: armW, h: 12, d: 4},
                pivotPos: new THREE.Vector3(armOff, -2, 0),
                meshOffset: new THREE.Vector3(0, -4, 0)
            },
            rightLeg: {
                uv: {inner: {x: 0, y: 16}, outer: {x: 0, y: 32}},
                size: {w: 4, h: 12, d: 4},
                pivotPos: new THREE.Vector3(-2, -12, 0),
                meshOffset: new THREE.Vector3(0, -6, 0)
            },
            leftLeg: {
                uv: {inner: {x: 16, y: 48}, outer: {x: 0, y: 48}},
                size: {w: 4, h: 12, d: 4},
                pivotPos: new THREE.Vector3(2, -12, 0),
                meshOffset: new THREE.Vector3(0, -6, 0)
            }
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

        for (const [name, parent] of Object.entries(JOINTS)) {
            const binding = new JointBinding(this.parts[parent], name);
            this.jointBindings.push(binding);
            this.parts[name] = binding.bone;
            this.defaultPositions[name] = binding.bone.position.clone();
        }
        // The torso joint bends its upper half about the centre (y = -6).
        // Compensate attachment positions to preserve existing head/arm pose JSON.
        this.upperBody = new THREE.Group();
        this.upperBody.position.set(0, 6, 0);
        this.parts.waist.add(this.upperBody);
        for (const name of ['head', 'rightArm', 'leftArm']) this.upperBody.add(this.parts[name]);
        this.updateBones();

        this.sockets = {};
        for (const [name, parent, y] of [['rightHand', 'rightElbow', -5.5], ['leftHand', 'leftElbow', -5.5], ['rightFoot', 'rightKnee', -6], ['leftFoot', 'leftKnee', -6]]) {
            const socket = new THREE.Object3D();
            socket.name = name;
            socket.position.y = y;
            this.parts[parent].add(socket);
            this.sockets[name] = socket;
        }
        this.updateBones();
        this.applyVisibility();
        if (oldTexture && oldTexture !== texture) oldTexture.dispose();
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

            const removed = new Set();
            this.parts.cape.traverse(mesh => removed.add(mesh));
            this.bodyMeshes = this.bodyMeshes.filter(mesh => !removed.has(mesh));
            this.parts.cape.removeFromParent();
            disposeObjectTree(this.parts.cape);
            delete this.parts.cape;
        }

        if (!texture) return;

        const size = {w: 10, h: 16, d: 1};
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

        (this.upperBody || this.playerGroup).add(pivotGroup);
        this.parts['cape'] = pivotGroup;
    }

    getGroup() {
        return this.playerGroup;
    }

    setVisibility(patch) {
        this.visibility = {
            ...this.visibility, ...patch,
            parts: {...this.visibility.parts, ...patch.parts},
            outerParts: {...this.visibility.outerParts, ...patch.outerParts}
        };
        this.applyVisibility();
    }

    applyVisibility() {
        this.playerGroup.traverse(mesh => {
            const {skinPart, skinLayer} = mesh.userData;
            if (mesh.userData.parentId) {
                const part = JOINTS[mesh.userData.parentId] || mesh.userData.parentId;
                mesh.visible = this.visibility.parts[part] !== false;
            }
            if (skinPart) mesh.visible = this.visibility.parts[skinPart] !== false && this.visibility[skinLayer] !== false && (skinLayer !== 'outer' || this.visibility.outerParts[skinPart] !== false);
        });
    }

    getAttachment(name) {
        return name === 'root' ? this.playerGroup : (this.sockets?.[name] || this.parts[name]);
    }

    getBones() {
        return Object.keys(this.parts).filter(name => this.parts[name].isBone);
    }

    getBone(name) {
        const bone = Object.hasOwn(this.parts, name) ? this.parts[name] : null;
        return bone?.isBone ? bone : null;
    }

    setBoneRotation(name, rotation) {
        const bone = this.getBone(name);
        if (!bone) throw new Error('Unknown bone: ' + name);
        if (!Array.isArray(rotation) || rotation.length !== 3 || !rotation.every(Number.isFinite)) {
            throw new TypeError('Bone rotation must contain three finite angles in radians');
        }
        bone.rotation.set(...rotation);
        this.updateBones();
    }

    updateBones() {
        this.jointBindings.forEach(binding => binding.update());
        this.playerGroup?.updateMatrixWorld(true);
        this.glowMeshes.forEach(layers => updateWorldGlow(layers));
    }

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

    darkenBody() {
        this.bodyMeshes.forEach(mesh => {
            if (!mesh.userData.darkMat) {
                const material = mesh.userData.originalMat.clone();
                material.color.set(0);
                material.emissive?.set(0);
                mesh.userData.darkMat = material;
            }
            mesh.material = mesh.userData.darkMat;
        });
    }

    restoreBody() {
        this.bodyMeshes.forEach(m => m.material = m.userData.originalMat);
    }

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

        if (!pose) {
            this.updateBones();
            return;
        }

        if (pose.root) {
            if (pose.root.pos) this.playerGroup.position.fromArray(pose.root.pos);
            if (pose.root.rot) this.playerGroup.rotation.fromArray(pose.root.rot);
            if (pose.root.scl) this.playerGroup.scale.fromArray(pose.root.scl);
        }

        for (const [name, data] of Object.entries(pose)) {
            if (name === 'root') continue;

            if (Object.hasOwn(this.parts, name) && data) {
                if (data.rot) this.parts[name].rotation.set(...data.rot);
                if (data.pos) this.parts[name].position.set(...data.pos);
                if (data.scl) this.parts[name].scale.set(...data.scl); // Added Scale support
            }
        }
        this.updateBones();
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
        this.upperBody = null;
        this.jointBindings = [];
    }
}