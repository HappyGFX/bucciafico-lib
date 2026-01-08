import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { HistoryManager } from '../managers/HistoryManager.js';

/**
 * Plugin responsible for User Interaction.
 * Handles: Transform Gizmos, Raycasting (Selecting objects), History (Undo/Redo).
 */
export class EditorPlugin {
    constructor() {
        this.name = 'EditorPlugin';
    }

    /**
     * Called by SkinViewer when plugin is added.
     * @param {SkinViewer} viewer
     */
    init(viewer) {
        this.viewer = viewer;
        this.history = new HistoryManager((state) => this.restoreState(state));

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.setupGizmo();
        this.bindEvents();
    }

    setupGizmo() {
        this.transformControl = new TransformControls(this.viewer.cameraManager.camera, this.viewer.renderer.domElement);
        this.transformControl.setMode('rotate');

        // Handle History recording on drag start
        this.transformControl.addEventListener('dragging-changed', (event) => {
            this.viewer.cameraManager.setEnabled(!event.value);
            if (event.value === true) {
                this.saveHistory();
            }
        });

        this.viewer.overlayScene.add(this.transformControl);
    }

    bindEvents() {
        this.onPointerDown = (e) => this.handleClick(e);
        this.viewer.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    }

    handleClick(event) {
        if (this.transformControl.dragging) return;

        const rect = this.viewer.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.viewer.cameraManager.camera);

        let objectsToCheck = [...this.viewer.skinModel.getGroup().children];

        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin) {
            objectsToCheck = [...objectsToCheck, ...itemsPlugin.items];
        }

        const intersects = this.raycaster.intersectObjects(objectsToCheck, true);

        if (intersects.length > 0) {
            let target = intersects[0].object;

            const skinGroup = this.viewer.skinModel.getGroup();
            let temp = target;
            while(temp) {
                if (temp.parent === skinGroup) {
                    target = temp;
                    break;
                }
                temp = temp.parent;
            }

            if (this.transformControl.object !== target) {
                this.selectObject(target);
            }
        } else {
            this.deselect();
        }
    }

    selectObject(obj) {
        this.transformControl.attach(obj);

        // Notify EffectsPlugin to draw outline
        const fx = this.viewer.getPlugin('EffectsPlugin');
        if (fx) fx.setSelected(obj);

        // Callback support (can be injected)
        if (this.viewer.onSelectionChanged) this.viewer.onSelectionChanged(obj);
    }

    deselect() {
        this.transformControl.detach();

        const fx = this.viewer.getPlugin('EffectsPlugin');
        if (fx) fx.setSelected(null);

        if (this.viewer.onSelectionChanged) this.viewer.onSelectionChanged(null);
    }

    /**
     * Sets gizmo mode.
     * @param {'translate'|'rotate'|'scale'} mode
     */
    setTransformMode(mode) {
        this.transformControl.setMode(mode);
    }

    // --- HISTORY API ---

    getSnapshot() {
        const pose = this.viewer.skinModel.getPose();
        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        const itemsState = itemsPlugin ? itemsPlugin.getSnapshot() : [];
        return { pose, items: itemsState };
    }

    saveHistory() { this.history.pushState(this.getSnapshot()); }
    undo() { this.history.undo(this.getSnapshot()); }
    redo() { this.history.redo(this.getSnapshot()); }

    restoreState(state) {
        if (state.pose) this.viewer.skinModel.setPose(state.pose);

        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin && state.items) {
            itemsPlugin.restoreSnapshot(state.items);
        }
    }

    dispose() {
        this.viewer.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
        this.transformControl.dispose();
    }
}