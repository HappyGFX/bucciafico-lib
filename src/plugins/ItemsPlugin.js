import * as THREE from 'three';
import { ItemFactory } from '../objects/ItemFactory.js';
import {disposeObjectTree} from "../utils/ThreeUtils.js";
import {createGlowMaterial} from "../materials/GlowMaterial.js";

/**
 * Plugin responsible for managing 3D Items (Swords, Blocks).
 */
export class ItemsPlugin {
    constructor() {
        this.name = 'ItemsPlugin';
        /** @type {Array<THREE.Mesh>} List of current items on scene */
        this.items = [];

        this.LAYERS_COUNT = 20;
    }

    init(viewer) {
        this.viewer = viewer;
    }

    _addGlowShells(mesh) {
        mesh.geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        mesh.geometry.boundingBox.getSize(size);
        const itemHeight = size.y || 1;

        const glowLayers = [];

        const glowGroup = new THREE.Group();
        glowGroup.name = "GlowShells";

        const shellGeo = mesh.geometry.clone();

        for (let i = 0; i < this.LAYERS_COUNT; i++) {
            const glowMat = createGlowMaterial(itemHeight);

            glowMat.uniforms.thickness.value = 0;
            glowMat.uniforms.opacity.value = 0;

            glowMat.polygonOffset = true;
            glowMat.polygonOffsetFactor = i * 0.1;

            const layerMesh = new THREE.Mesh(shellGeo, glowMat);
            layerMesh.userData.isGlowLayer = true;
            layerMesh.userData.glowMat = glowMat;

            glowLayers.push(layerMesh);
            glowGroup.add(layerMesh);
        }

        mesh.add(glowGroup);
        mesh.userData.glowLayers = glowLayers;
    }

    /**
     * Creates and adds an item to the scene.
     * @param {string} url - Texture URL.
     * @param {string} name - Item name.
     */
    addItem(url, name) {
        const editor = this.viewer.getPlugin('EditorPlugin');
        if (editor) editor.saveHistory();

        return ItemFactory.createFromURL(url, name).then(mesh => {
            mesh.position.set(8, 8, 8);
            mesh.userData.sourceUrl = url;

            this._addGlowShells(mesh);

            const fx = this.viewer.getPlugin('EffectsPlugin');
            if (fx) {
                const config = fx.getConfig();
                this.updateItemGlow(mesh, config);
            }

            this.viewer.scene.add(mesh);
            this.items.push(mesh);

            if (editor) editor.selectObject(mesh);

            if (this.viewer.emit) this.viewer.emit('items:added', mesh);

            return mesh;
        });
    }

    removeItem(mesh) {
        const editor = this.viewer.getPlugin('EditorPlugin');
        if (editor) editor.saveHistory();

        this.viewer.scene.remove(mesh);
        this.items = this.items.filter(i => i !== mesh);

        disposeObjectTree(mesh);

        if (editor) editor.deselect();

        if (this.viewer.emit) this.viewer.emit('items:removed', mesh);
    }

    // --- EFFECTS ---

    updateAllGlow(config) {
        this.items.forEach(item => {
            this.updateItemGlow(item, config);
        });
    }

    updateItemGlow(item, config) {
        if (!item.userData.glowLayers) return;

        const maxThickness = (config.thickness || 4) * 0.05;
        const heightLimit = config.height !== undefined ? config.height : 0.5;
        const enabled = config.enabled;

        item.userData.glowLayers.forEach((layer, i) => {
            const mat = layer.userData.glowMat;
            if (!mat) return;

            const progress = (i + 1) / this.LAYERS_COUNT;
            mat.uniforms.thickness.value = maxThickness * progress;

            mat.uniforms.gradientLimit.value = heightLimit;

            if (!enabled) {
                mat.uniforms.opacity.value = 0.0;
            } else {
                const baseOpacity = 1.2 / this.LAYERS_COUNT;
                mat.uniforms.opacity.value = baseOpacity;
            }
        });
    }

    // --- SNAPSHOT HELPERS ---

    getSnapshot() {
        return this.items.map(item => ({
            name: item.name,
            uuid: item.uuid,
            pos: item.position.toArray(),
            rot: item.rotation.toArray(),
            scale: item.scale.toArray()
        }));
    }

    restoreSnapshot(itemsState) {
        itemsState.forEach(state => {
            // Try to find the item by UUID first, then Name
            const item = this.items.find(i => i.uuid === state.uuid || i.name === state.name);
            if (item) {
                item.position.fromArray(state.pos);
                item.rotation.fromArray(state.rot);
                item.scale.fromArray(state.scale);
            }
        });
    }

    dispose() {
        this.items.forEach(mesh => {
            this.viewer.scene.remove(mesh);
            disposeObjectTree(mesh);
        });
        this.items = [];
    }
}