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
        this.hoveredObject = null;
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

        this.transformControl.addEventListener('change', () => {
            if (this.transformControl.object) {
                this.viewer.emit('transform:change', this.transformControl.object);
            }
        });


        this.viewer.overlayScene.add(this.transformControl);
    }

    bindEvents() {
        this.onPointerDown = (e) => this.handleClick(e);
        this.onPointerMove = (e) => this.handleHover(e);

        const canvas = this.viewer.renderer.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointermove', this.onPointerMove);
    }

    getIntersects(event) {
        const rect = this.viewer.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.viewer.cameraManager.camera);

        let objectsToCheck = [];

        this.viewer.skinModel.getGroup().traverse((child) => {
            if (child.isMesh && child.material.visible) {
                if (child.material.side !== THREE.BackSide) {
                    objectsToCheck.push(child);
                }
            }
        });

        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin) {
            objectsToCheck = [...objectsToCheck, ...itemsPlugin.items];
        }

        return this.raycaster.intersectObjects(objectsToCheck, false);
    }

    handleHover(event) {
        if (this.transformControl.dragging) return;

        const intersects = this.getIntersects(event);

        if (intersects.length > 0) {
            const target = intersects[0].object;

            if (this.hoveredObject !== target) {
                this.unhighlightObject();
                this.highlightObject(target);
            }

            this.viewer.renderer.domElement.style.cursor = 'pointer';
        } else {
            this.unhighlightObject();
            this.viewer.renderer.domElement.style.cursor = 'default';
        }
    }

    highlightObject(obj) {
        this.hoveredObject = obj;

        if (obj.material && obj.material.emissive) {
            if (!obj.userData.originalHex) {
                obj.userData.originalHex = obj.material.emissive.getHex();
            }
            obj.material.emissive.setHex(0x444444);
        }
    }

    unhighlightObject() {
        if (this.hoveredObject) {
            const obj = this.hoveredObject;
            if (obj.material && obj.material.emissive && obj.userData.originalHex !== undefined) {
                obj.material.emissive.setHex(obj.userData.originalHex);
            }
            this.hoveredObject = null;
        }
    }

    handleClick(event) {
        if (this.transformControl.dragging) return;

        const rect = this.viewer.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.viewer.cameraManager.camera);

        let objectsToCheck = [];

        const playerGroup = this.viewer.skinModel.getGroup();
        if (playerGroup) objectsToCheck.push(playerGroup);

        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin) {
            objectsToCheck = [...objectsToCheck, ...itemsPlugin.items];
        }

        const intersects = this.raycaster.intersectObjects(objectsToCheck, true);

        if (intersects.length > 0) {
            let hitObject = intersects[0].object;
            let logicalTarget = hitObject;

            while (logicalTarget.parent) {
                if (logicalTarget.parent === playerGroup) {
                    break;
                }
                if (logicalTarget.parent.type === 'Scene') {
                    break;
                }
                if (logicalTarget === playerGroup) {
                    break;
                }

                logicalTarget = logicalTarget.parent;
            }

            if (!logicalTarget) logicalTarget = hitObject;

            if (this.transformControl.object !== logicalTarget) {
                this.selectObject(logicalTarget);
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
        this.viewer.emit('selection:change', obj);
    }

    deselect() {
        this.transformControl.detach();

        const fx = this.viewer.getPlugin('EffectsPlugin');
        if (fx) fx.setSelected(null);

        this.viewer.emit('selection:cleared');
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
        if (this.viewer.renderer.domElement) {
            this.viewer.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
            this.viewer.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
        }

        if (this.transformControl) {
            this.transformControl.detach();
            this.transformControl.dispose();
            if (this.transformControl.parent) {
                this.transformControl.parent.remove(this.transformControl);
            }
        }
    }
}