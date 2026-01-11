import { ItemFactory } from '../objects/ItemFactory.js';
import {disposeObjectTree} from "../utils/ThreeUtils.js";

/**
 * Plugin responsible for managing 3D Items (Swords, Blocks).
 */
export class ItemsPlugin {
    constructor() {
        this.name = 'ItemsPlugin';
        /** @type {Array<THREE.Mesh>} List of current items on scene */
        this.items = [];
    }

    init(viewer) {
        this.viewer = viewer;
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
            this.viewer.scene.add(mesh);
            this.items.push(mesh);

            // Auto-select if editor is present
            if (editor) editor.selectObject(mesh);
            return mesh;
        });
    }

    removeItem(mesh) {
        const editor = this.viewer.getPlugin('EditorPlugin');
        if (editor) editor.saveHistory();

        this.viewer.scene.remove(mesh);
        this.items = this.items.filter(i => i !== mesh);

        if (editor) editor.deselect();
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