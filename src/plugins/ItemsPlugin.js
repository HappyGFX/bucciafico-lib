import {ImportedModelStore} from '../resources/ModelAdapters.js';
import {ResourceItemMethods} from './ResourceItemMethods.js';
import {EquipmentMethods} from './EquipmentMethods.js';
import * as THREE from 'three';
import {ItemFactory} from '../objects/ItemFactory.js';
import {disposeObjectTree} from "../utils/ThreeUtils.js";
import {createGlowMaterial, updateWorldGlow} from "../materials/GlowMaterial.js";

/**
 * Plugin responsible for managing 3D Items (Swords, Blocks).
 */
export class ItemsPlugin {
    constructor() {
        this.name = 'ItemsPlugin';
        /** @type {Array<THREE.Mesh>} List of current items on scene */
        this.items = [];
        this.models = new ImportedModelStore();
        this.resourceScopes = new Map();

        this.LAYERS_COUNT = 20;
    }

    init(viewer) {
        this.viewer = viewer;
        this.unsubs = ['transform:change', 'characters:change', 'skin:loaded', 'pose:change'].map(event => viewer.on(event, () => this.updateEquipment()));
    }

    attachItem(itemMesh, partName, characterId = this.viewer.activeCharacter?.id) {
        const editor = this.viewer.getPlugin('EditorPlugin');
        if (editor) editor.saveHistory();

        const skinModel = this.viewer.getCharacter(characterId)?.model;
        if (partName && !skinModel?.getAttachment(partName)) throw new Error('Nie znaleziono części ciała.');

        if (!partName) {
            this.viewer.scene.attach(itemMesh);
            itemMesh.userData.parentId = null;
            itemMesh.userData.characterId = null;
        } else if (skinModel.getAttachment(partName)) {
            const targetGroup = skinModel.getAttachment(partName);
            targetGroup.attach(itemMesh);
            itemMesh.userData.parentId = partName;
            itemMesh.userData.characterId = characterId;
        }

        delete itemMesh.userData.twoHanded;
        skinModel?.applyVisibility();
        this.updateEquipment();
        this.viewer.requestRender();
        if (this.viewer.emit) this.viewer.emit('transform:change', itemMesh);
    }

    _addGlowShells(mesh, gradient = null) {
        if (mesh.userData.glowLayers) return;
        mesh.geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        mesh.geometry.boundingBox.getSize(size);
        const itemHeight = gradient?.height || size.y || 1;

        const glowLayers = [];

        const glowGroup = new THREE.Group();
        glowGroup.name = "GlowShells";

        // Resource instances own their materials; their cached geometry stays shared.
        const shellGeo = gradient ? mesh.geometry : mesh.geometry.clone();

        for (let i = 0; i < this.LAYERS_COUNT; i++) {
            const glowMat = createGlowMaterial(itemHeight, mesh.material.map || null, gradient || {minY: mesh.geometry.boundingBox.min.y});

            glowMat.uniforms.thickness.value = 0;
            glowMat.uniforms.opacity.value = 0;

            glowMat.polygonOffset = true;
            glowMat.polygonOffsetFactor = i * 0.1;

            const layerMesh = new THREE.Mesh(shellGeo, glowMat);
            layerMesh.userData.isGlowLayer = true;
            layerMesh.userData.glowMat = glowMat;
            layerMesh.visible = false;

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
        if(!this.viewer.getPlugin('EditorPlugin')?.restoring)this.viewer.getPlugin('SceneToolsPlugin')?.checkCapacity(1);
        const editor = this.viewer.getPlugin('EditorPlugin');
        return ItemFactory.createFromURL(url, name).then(mesh => {
            try{if(!editor?.restoring)this.viewer.getPlugin('SceneToolsPlugin')?.checkCapacity(1);}catch(e){disposeObjectTree(mesh);throw e;}
            editor?.saveHistory();
            mesh.position.set(8, 8, 8);
            mesh.userData.sourceUrl = url;
            mesh.userData.pixelScale = mesh.scale.x;

            this._addGlowShells(mesh);

            const fx = this.viewer.getPlugin('EffectsPlugin');
            if (fx) {
                const config = fx.getConfig();
                this.updateItemGlow(mesh, config);
            }

            this.viewer.scene.add(mesh);
            this.items.push(mesh);

            if (editor && !editor.restoring) editor.selectObject(mesh);

            if (this.viewer.emit) this.viewer.emit('items:added', mesh);

            return mesh;
        });
    }

    async addImportedModel(id, name='Imported model') {
        if(!this.viewer.getPlugin('EditorPlugin')?.restoring)this.viewer.getPlugin('SceneToolsPlugin')?.checkCapacity(1);
        const content=await this.models.create(id), root=new THREE.Group();
        try{if(!this.viewer.getPlugin('EditorPlugin')?.restoring)this.viewer.getPlugin('SceneToolsPlugin')?.checkCapacity(1);}catch(e){disposeObjectTree(content);throw e;}
        root.name=name;root.userData.importedModel=id;root.add(content);
        this.viewer.getPlugin('EditorPlugin')?.saveHistory();
        this.viewer.scene.add(root);this.items.push(root);
        const fx=this.viewer.getPlugin('EffectsPlugin');if(fx)this.updateItemGlow(root,fx.getConfig());
        if(!this.viewer.getPlugin('EditorPlugin')?.restoring)this.viewer.getPlugin('EditorPlugin')?.selectObject(root);
        this.viewer.emit('items:added',root);this.viewer.requestRender();return root;
    }

    addMissingItem(record,error) {
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(12,12,12),new THREE.MeshBasicMaterial({color:0xff35b8,wireframe:true}));
        mesh.name=record.name||'Missing object';
        mesh.userData.missingSource=structuredClone(record.missingSource||{sourceUrl:record.sourceUrl,resource:record.resource,importedModel:record.importedModel,resourceScope:record.resourceScope,error});
        mesh.userData.resourceError=error;this.viewer.scene.add(mesh);this.items.push(mesh);this.viewer.emit('items:added',mesh);return mesh;
    }
    removeItem(mesh) {
        const editor = this.viewer.getPlugin('EditorPlugin');
        if (editor) editor.saveHistory();

        if (mesh.userData.resourceSpec) mesh.userData.resourceToken = (mesh.userData.resourceToken || 0) + 1;
        mesh.removeFromParent();
        this.items = this.items.filter(i => i !== mesh);

        disposeObjectTree(mesh);

        if (editor) editor.deselect();

        if (this.viewer.emit) this.viewer.emit('items:removed', mesh);
    }

    // --- EFFECTS ---

    updateWorldGlow() {
        for (const item of this.items) {
            const sources = [], layers = [];
            item.traverse(mesh => {
                if (!mesh.isMesh) return;
                (mesh.userData.isGlowLayer ? layers : sources).push(mesh);
            });
            updateWorldGlow(layers, sources);
        }
    }

    updateAllGlow(config) {
        this.items.forEach(item => {
            this.updateItemGlow(item, config);
        });
    }

    updateItemGlow(item, config) {
        if (item.userData.resourceSpec || item.userData.importedModel) {
            if (item.userData.resourceError) return;
            const meshes = [];
            item.traverse(mesh => {
                if (mesh.isMesh && !mesh.userData.isGlowLayer) meshes.push(mesh);
            });
            if (config.enabled && meshes.some(mesh => !mesh.userData.glowLayers)) {
                item.updateWorldMatrix(true, true);
                const inverse = item.matrixWorld.clone().invert();
                const bounds = new THREE.Box3();
                const transforms = new Map();
                for (const mesh of meshes) {
                    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
                    transforms.set(mesh, matrix);
                    mesh.geometry.computeBoundingBox();
                    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
                }
                for (const mesh of meshes) this._addGlowShells(mesh, {
                    height: Math.max(bounds.max.y - bounds.min.y, 0.001),
                    minY: bounds.min.y,
                    matrix: transforms.get(mesh),
                });
            }
            for (const mesh of meshes) this.updateItemGlow(mesh, config);
            return;
        }
        if (!item.userData.glowLayers) return;

        const maxThickness = (config.thickness || 4) * 0.05;
        const heightLimit = config.height !== undefined ? config.height : 0.5;
        const enabled = config.enabled;

        item.userData.glowLayers.forEach((layer, i) => {
            layer.visible = !!enabled;
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
            parentId: item.userData.parentId || null,
            characterId: item.userData.characterId || null,
            pos: item.position.toArray(),
            rot: item.rotation.toArray(),
            equipment: this.equipmentData(item),
            resource: item.userData.resourceSpec ? structuredClone(item.userData.resourceSpec) : undefined,
            scale: item.scale.toArray()
        }));
    }

    restoreSnapshot(itemsState) {
        itemsState.forEach(state => {
            let item = this.items.find(i => state.uuid ? i.uuid === state.uuid : i.name === state.name);
            if (item) {
                if (state.parentId !== item.userData.parentId || state.characterId !== item.userData.characterId) {
                    this.attachItem(item, state.parentId, state.characterId);
                }

                item.position.fromArray(state.pos);
                item.rotation.fromArray(state.rot);
                item.scale.fromArray(state.scale);
                this.restoreEquipmentData(item, state.equipment);
                if (state.resource && JSON.stringify(state.resource) !== JSON.stringify(item.userData.resourceSpec)) {
                    item.userData.resourceSpec = structuredClone(state.resource);
                    this.populateAsset(item, true);
                }
            }
        });
    }

    dispose() {
        this.resourceUnsub?.();
        this.unsubs?.forEach(fn => fn());
        this.items.forEach(mesh => {
            mesh.removeFromParent();
            disposeObjectTree(mesh);
        });
        this.items = [];
        this.resourceRenderer?.dispose();
        for(const scope of this.resourceScopes.values())scope.renderer.dispose();
        this.models.dispose();
    }
}

Object.assign(ItemsPlugin.prototype, EquipmentMethods);

Object.assign(ItemsPlugin.prototype, ResourceItemMethods);
