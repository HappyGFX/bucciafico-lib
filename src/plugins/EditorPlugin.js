import {containsEditLock} from '../utils/EditLocks.js';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { HistoryManager } from '../managers/HistoryManager.js';
import { JOINTS } from '../objects/BoneRig.js';

/**
 * Plugin responsible for User Interaction.
 * Handles: Transform Gizmos, Raycasting (Selecting objects), History (Undo/Redo).
 */
export class EditorPlugin {
    constructor() {
        this.name = 'EditorPlugin';
        this.hoveredObject = null;
        this.mode = 'rotate';
        this.selectedObjects = [];
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
        this.unsubscribeSkin = viewer.on('skin:loaded', () => this.deselect());
        this.unsubscribeTransform = viewer.on('transform:change', () => this.syncBoneHandle());
    }

    setupGizmo() {
        const createControl = (size) => {
            const control = new TransformControls(this.viewer.cameraManager.camera, this.viewer.renderer.domElement);
            control.setMode('rotate');
            control.setSpace('local');
            control.setSize(size);
            this.viewer.overlayScene.add(control.getHelper?.() || control);
            control.addEventListener('dragging-changed', event => {
                if (event.value) {
                    this.cameraWasEnabled = this.viewer.cameraManager.controls.enabled;
                    this.viewer.cameraManager.setEnabled(false);
                    this.saveHistory();
                    this.scaleStart=control.object.scale.clone();
                    this.dragStart={position:control.object.position.clone(),rotation:control.object.rotation.clone(),scale:control.object.scale.clone()};
                    this.boneRotationStart=this.boneTarget?.rotation.clone();
                    if(control.object!==this.viewer.getPlugin('SceneToolsPlugin')?.pivot)this.selectedObject = control === this.boneControl ? this.boneTarget : control.object;
                    this.viewer.emit('selection:change', this.selectedObject);
                } else {
                    this.viewer.cameraManager.setEnabled(this.cameraWasEnabled ?? true);
                }
            });
            control.addEventListener('change', () => {
                this.viewer.skinModel.updateBones();
                this.viewer.requestRender();
                if (control.object) this.viewer.emit('transform:change', control === this.boneControl ? this.boneTarget : control.object);
            });
            return control;
        };
        this.transformControl = createControl(1);
        this.transformControl.addEventListener('objectChange',()=>{
            const control=this.transformControl;
            const character=this.viewer.characterForObject(control.object);
            if(control.mode==='scale' && character?.lockScale && this.scaleStart){
                const axis=(control.axis?.[0]||'X').toLowerCase();
                const factor=control.object.scale[axis]/(this.scaleStart[axis]||1);
                if(Number.isFinite(factor)&&factor>0)control.object.scale.copy(this.scaleStart).multiplyScalar(factor);
                this.viewer.emit('transform:change',control.object);
            }
            const tools=this.viewer.getPlugin('SceneToolsPlugin');
            const locks=tools?.selection.length?tools.settings.locks:this.viewer.getPlugin('PosePlugin')?.settings.locks;
            if(this.dragStart&&locks)for(const axis of ['x','y','z'])if(locks[axis]){
                const field={translate:'position',rotate:'rotation',scale:'scale'}[control.mode];
                if(field)control.object[field][axis]=this.dragStart[field][axis];
            }
            this.viewer.emit('transform:change',control.object);
        });
        this.boneControl = createControl(0.48);
        // A display handle shares the outer gizmo's centre. The real joint keeps
        // its anatomical pivot; only the handle's orientation is applied to it.
        this.boneHandle = new THREE.Object3D();
        this.viewer.overlayScene.add(this.boneHandle);
        const palette = { X: 0xff9d45, Y: 0x38d9e6, Z: 0xb58aff, E: 0xf1b8fa, XYZE: 0xf1b8fa };
        this.boneControl.traverse(child => {
            if (child.material?.color && palette[child.name]) {
                child.material.color.setHex(palette[child.name]);
                child.material._color = child.material.color.clone();
            }
        });
        this.boneControl.addEventListener('objectChange', () => {
            if (!this.boneTarget) return;
            const parentRotation = this.boneTarget.parent.getWorldQuaternion(new THREE.Quaternion());
            this.boneTarget.quaternion.copy(parentRotation.invert().multiply(this.boneHandle.quaternion));
            const locks=this.viewer.getPlugin('PosePlugin')?.settings.locks;
            if(this.boneRotationStart&&locks)for(const axis of ['x','y','z'])if(locks[axis])this.boneTarget.rotation[axis]=this.boneRotationStart[axis];
            this.viewer.skinModel.updateBones();
            this.viewer.emit('transform:change', this.boneTarget);
            this.viewer.requestRender();
        });
    }

    syncBoneHandle() {
        if (!this.boneTarget || !this.transformControl.object) return;
        this.viewer.skinModel.updateBones();
        this.transformControl.object.getWorldPosition(this.boneHandle.position);
        if (!this.boneControl.dragging) this.boneTarget.getWorldQuaternion(this.boneHandle.quaternion);
        this.boneHandle.updateMatrixWorld(true);
    }

    // Decide which set of rings owns the gesture before Three.js handles it.
    // Small bone rings take priority where their hit areas overlap the outer gizmo.
    routePointer(event) {
        if(this.restoring||this.selectedObjects.some(containsEditLock))return;
        if (this.viewer.getPlugin('PosePlugin')?.ikControl) return;
        if (this.transformControl.dragging || this.boneControl.dragging || this.mode === 'view') return;
        this.syncBoneHandle();
        const rect = this.viewer.renderer.domElement.getBoundingClientRect();
        const pointer = { x: (event.clientX - rect.left) / rect.width * 2 - 1,
            y: -(event.clientY - rect.top) / rect.height * 2 + 1, button: event.button };
        const controls = [this.boneControl, this.transformControl];
        for (const control of controls) {
            control.enabled = true;
            (control.getHelper?.() || control).updateMatrixWorld(true);
            control.pointerHover(pointer);
        }
        const owner = controls.find(control => control.object && control.axis);
        for (const control of controls) {
            control.enabled = !owner || owner === control;
            if (owner && owner !== control) control.axis = null;
        }
    }

    bindEvents() {
        const canvas = this.viewer.renderer.domElement;
        this.onRoutePointer = event => this.routePointer(event);
        this.onPointerDown = event => this.handleClick(event);
        this.onPointerMove = event => this.handleHover(event);
        this.onPointerEnd = () => {
            // Also covers pointercancel/lostpointercapture, where Three.js has no handler.
            for (const control of [this.transformControl, this.boneControl]) {
                if (control.dragging) control.pointerUp({ button: 0 });
                control.enabled = this.mode !== 'view';
            }
        };
        canvas.addEventListener('pointerdown', this.onRoutePointer, true);
        canvas.addEventListener('pointermove', this.onRoutePointer, true);
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointermove', this.onPointerMove);
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, this.onPointerEnd);
    }

    getIntersects(event) {
        const rect = this.viewer.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.viewer.cameraManager.camera);

        let objectsToCheck = [];

        this.viewer.characters.forEach(c=>c.model.getGroup().traverse((child) => {
            if (child.isMesh && child.visible && !child.userData.isGlow && child.material.visible) {
                if (child.material.side !== THREE.BackSide) {
                    objectsToCheck.push(child);
                }
            }
        }));

        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin) {
            objectsToCheck = [...objectsToCheck, ...itemsPlugin.items];
        }

        return this.raycaster.intersectObjects(objectsToCheck, true).filter(hit=>{for(let o=hit.object;o;o=o.parent)if(!o.visible||o.userData.isGlow||o.userData.isGlowLayer)return false;return true;});
    }

    handleHover(event) {
        if (this.transformControl.dragging || this.boneControl.dragging) return;

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
        if(this.restoring)return;
        if (this.viewer.getPlugin('PosePlugin')?.ikControl) return;
        if (event.button !== 0 || this.transformControl.dragging || this.boneControl.dragging || this.transformControl.axis || this.boneControl.axis) return;
        this.viewer.skinModel.updateBones();

        const rect = this.viewer.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.viewer.cameraManager.camera);

        let objectsToCheck = [];

        const playerGroup = this.viewer.skinModel.getGroup();
        objectsToCheck.push(...this.viewer.characters.map(c=>c.model.getGroup()));

        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin) {
            objectsToCheck = [...objectsToCheck, ...itemsPlugin.items];
        }

        const intersects = this.raycaster.intersectObjects(objectsToCheck, true)
            .filter(hit => {for(let o=hit.object;o;o=o.parent)if(!o.visible||o.userData.isGlow||o.userData.isGlowLayer)return false;return true;});

        if (intersects.length > 0) {
            let hitObject = intersects[0].object;
            const previousSelection=[...this.selectedObjects];
            const owner=this.viewer.characterForObject(hitObject);
            if(owner)this.viewer.selectCharacter(owner.id);
            let logicalTarget = hitObject;
            while (logicalTarget.parent) {
                if (itemsPlugin?.items.includes(logicalTarget)) break;
                if (Object.values(this.viewer.skinModel.parts).includes(logicalTarget)) break;
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
            for(let parent=logicalTarget.parent;parent;parent=parent.parent)if(parent.userData.sceneGroup)logicalTarget=parent;
            if(event.ctrlKey||event.metaKey){this.selectObjects(previousSelection.includes(logicalTarget)?previousSelection.filter(o=>o!==logicalTarget):[...previousSelection,logicalTarget]);return;}

            if (this.transformControl.object !== logicalTarget) {
                this.selectObject(logicalTarget);
            }
        } else {
            this.deselect();
        }
    }

    selectObject(obj) {
        if (!obj) return;
        if (this.mode === 'view') this.setTransformMode('rotate');
        const owner=this.viewer.characterForObject(obj);
        if(owner)this.viewer.selectCharacter(owner.id);
        this.selectedObject = obj;
        this.selectedObjects = [obj];
        const model = this.viewer.skinModel;
        const parentName = JOINTS[obj.name];
        const main = parentName ? model.parts[parentName] : obj;
        const jointName = parentName ? obj.name : Object.keys(JOINTS).find(name => model.parts[JOINTS[name]] === main);
        this.transformControl.attach(main);
        this.boneTarget = jointName ? model.getBone(jointName) : null;
        if (this.boneTarget) {
            this.syncBoneHandle();
            this.boneControl.attach(this.boneHandle);
        } else this.boneControl.detach();
        const fx = this.viewer.getPlugin('EffectsPlugin');
        if (fx) fx.setSelected(main);
        this.viewer.emit('selection:change', obj);
    }

    selectObjects(objects,active=objects.at(-1)) {
        objects=[...new Set(objects.filter(Boolean))];
        if(!objects.length)return this.deselect();
        if(objects.length===1)return this.selectObject(objects[0]);
        if(!objects.includes(active))active=objects.at(-1);
        const owner=this.viewer.characterForObject(active);if(owner)this.viewer.selectCharacter(owner.id);
        this.selectedObjects=objects;this.selectedObject=active;
        this.boneTarget=null;this.boneControl.detach();
        const effects=this.viewer.getPlugin('EffectsPlugin');if(effects)effects.composer.outlinePass.selectedObjects=objects;
        this.viewer.emit('selection:change',active);
    }

    deselect() {
        this.transformControl.detach();
        this.boneControl.detach();
        this.boneTarget = null;
        this.selectedObject = null;
        this.selectedObjects = [];
        const fx = this.viewer.getPlugin('EffectsPlugin');
        if (fx) fx.setSelected(null);
        this.viewer.emit('selection:cleared');
    }

    /** Outer transform tool; the inner joint rings always remain available. */
    setTransformMode(mode) {
        // Keep the old API mode as an alias, without a separate Studio tool.
        if (mode === 'bones') mode = 'rotate';
        if (!['view', 'translate', 'rotate', 'scale'].includes(mode)) return;
        this.mode = mode;
        this.transformControl.enabled = mode !== 'view';
        this.boneControl.enabled = mode !== 'view';
        this.transformControl.setMode(mode === 'view' ? 'rotate' : mode);
        this.transformControl.setSpace(mode === 'translate' ? 'world' : 'local');
        if (mode === 'view') this.deselect();
        this.viewer.emit('tool:change', mode);
        this.viewer.requestRender();
    }

    selectBone(name) {
        const bone = this.viewer.skinModel.getBone(name);
        if (!bone) throw new Error('Unknown bone: ' + name);
        this.selectObject(bone);
    }

    // --- HISTORY API ---

    getSnapshot() {
        if(this.viewer.getPlugin('SceneToolsPlugin'))return null;
        const pose = this.viewer.skinModel.getPose();
        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        const itemsState = itemsPlugin ? itemsPlugin.getSnapshot() : [];
        return { pose, characters:this.viewer.characters.map(c=>({id:c.id,footPins:structuredClone(c.footPins||{}),pose:c.model.getPose(),visibility:structuredClone(c.model.visibility)})), items: itemsState };
    }

    saveHistory() { if(this.restoring)return;this.history.pushState(this.getSnapshot()); }
    undo() { return this.history.undo(this.getSnapshot()); }
    redo() { return this.history.redo(this.getSnapshot()); }

    restoreState(state) {
        this.restoring=true;
        try {
        if(state.characters)state.characters.forEach(data=>{const c=this.viewer.getCharacter(data.id);if(c){c.footPins=structuredClone(data.footPins||{});c.model.setPose(data.pose);c.model.setVisibility(data.visibility);}});
        else if (state.pose) this.viewer.skinModel.setPose(state.pose);

        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin && state.items) {
            itemsPlugin.restoreSnapshot(state.items);
        }
        this.viewer.emit('transform:change', this.selectedObject);
        this.viewer.emit('pose:change');
        this.viewer.requestRender();
        }finally{this.restoring=false;}
    }

    dispose() {
        this.unsubscribeSkin?.();
        this.unsubscribeTransform?.();
        this.boneHandle.removeFromParent();
        const canvas = this.viewer.renderer.domElement;
        if (canvas) {
            canvas.removeEventListener('pointerdown', this.onRoutePointer, true);
            canvas.removeEventListener('pointermove', this.onRoutePointer, true);
            canvas.removeEventListener('pointerdown', this.onPointerDown);
            canvas.removeEventListener('pointermove', this.onPointerMove);
            for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(event, this.onPointerEnd);
        }
        for (const control of [this.transformControl, this.boneControl]) {
            control.detach();
            (control.getHelper?.() || control).removeFromParent();
            control.dispose();
        }
    }
}
