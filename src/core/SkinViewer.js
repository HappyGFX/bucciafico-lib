import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { CameraManager } from '../managers/CameraManager.js';
import { PostProcessingManager } from '../managers/PostProcessingManager.js';
import { HistoryManager } from '../managers/HistoryManager.js';
import { SceneSetup } from '../objects/SceneSetup.js';
import { SkinModel } from '../objects/SkinModel.js';
import { ItemFactory } from '../objects/ItemFactory.js';
import { detectSlimSkin } from '../utils/SkinUtils.js';

/**
 * Main class for the Minecraft Skin Studio engine.
 * Handles the Three.js scene, rendering loop, inputs, and model logic.
 * Framework-agnostic (works with React, Vue, Vanilla JS).
 */
export class SkinViewer {
    /**
     * Creates a new instance of the SkinViewer.
     * @param {HTMLElement} containerElement - The DOM element (div) where the canvas will be appended.
     * @param {Object} [config] - Configuration options.
     * @param {boolean} [config.isEditor=true] - If true, enables gizmos, raycasting, and interaction.
     * @param {boolean} [config.showGrid=true] - If true, renders the floor grid.
     * @param {boolean} [config.transparent=false] - If true, the canvas background will be transparent.
     * @param {number} [config.bgColor=0x141417] - Hex color of the background (if not transparent).
     * @param {boolean} [config.cameraEnabled=true] - If true, allows user to rotate/zoom the camera.
     */
    constructor(containerElement, config = {}) {
        this.container = containerElement;

        this.config = {
            isEditor: config.isEditor ?? true,
            showGrid: config.showGrid ?? true,
            transparent: config.transparent ?? false,
            bgColor: config.bgColor ?? 0x141417,
            cameraEnabled: config.cameraEnabled ?? true,
            ...config
        };

        /** @type {boolean} Flag to stop the animation loop when disposed. */
        this.isDisposed = false;

        // --- 1. RENDERER ---
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: this.config.transparent,
            preserveDrawingBuffer: true
        });

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.useLegacyLights = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.autoClear = false;

        this.container.appendChild(this.renderer.domElement);

        // --- 2. SCENES ---
        this.scene = new THREE.Scene();
        if (!this.config.transparent) {
            this.scene.background = new THREE.Color(this.config.bgColor);
        }
        this.overlayScene = new THREE.Scene();

        // --- 3. COMPONENTS ---
        this.sceneSetup = new SceneSetup(this.scene);
        this.sceneSetup.setGridVisible(this.config.showGrid);

        this.cameraManager = new CameraManager(this.renderer.domElement, width, height);
        this.cameraManager.setEnabled(this.config.cameraEnabled);

        this.postProcessor = new PostProcessingManager(this.renderer, this.scene, this.cameraManager.camera, width, height);

        // --- 4. MODEL LOGIC ---
        this.skinModel = new SkinModel();
        this.scene.add(this.skinModel.getGroup());

        /** @type {THREE.Mesh[]} List of additional 3D items (swords, blocks) in the scene. */
        this.items = [];

        // --- 5. EDITOR TOOLS ---
        if (this.config.isEditor) {
            this.history = new HistoryManager((state) => this.restoreState(state));
            this.setupEditor();
            this.raycaster = new THREE.Raycaster();
            this.mouse = new THREE.Vector2();

            this.onMouseClick = this.onMouseClick.bind(this);
            this.renderer.domElement.addEventListener('pointerdown', this.onMouseClick);
        }

        // --- 6. ANIMATION LOOP ---
        this.animate = this.animate.bind(this);
        this.animate();
    }

    /**
     * Handles container resizing. Should be called whenever the parent container size changes.
     * In React, use ResizeObserver to call this.
     */
    onResize() {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.cameraManager.onResize(width, height);
        this.renderer.setSize(width, height);
        this.postProcessor.resize(width, height);
    }

    /**
     * Cleans up resources, removes event listeners, and stops the render loop.
     * Must be called when the viewer is unmounted.
     */
    dispose() {
        this.isDisposed = true;

        if (this.container && this.renderer.domElement) {
            this.container.removeChild(this.renderer.domElement);
        }

        if (this.config.isEditor) {
            this.renderer.domElement.removeEventListener('pointerdown', this.onMouseClick);
        }

        this.renderer.dispose();
    }

    // --- EDITOR LOGIC ---

    setupEditor() {
        this.transformControl = new TransformControls(this.cameraManager.camera, this.renderer.domElement);
        this.transformControl.setMode('rotate');

        this.transformControl.addEventListener('dragging-changed', (event) => {
            this.cameraManager.setEnabled(!event.value);
            if (event.value === true) {
                // Save state BEFORE the modification starts
                this.saveHistory();
            }
        });

        this.transformControl.addEventListener('change', () => {
            if (this.onEditCallback) this.onEditCallback(this.skinModel.getPose());
        });

        this.overlayScene.add(this.transformControl);
    }

    /**
     * Toggles the Editor mode (Gizmos, Raycasting, History).
     * @param {boolean} enable
     */
    setEditorMode(enable) {
        this.config.isEditor = enable;

        if (enable) {
            if (!this.transformControl) {
                if (!this.history) this.history = new HistoryManager((state) => this.restoreState(state));
                this.setupEditor();
                if (!this.raycaster) this.raycaster = new THREE.Raycaster();
                if (!this.mouse) this.mouse = new THREE.Vector2();
                if (!this.onMouseClick) this.onMouseClick = this.onMouseClick.bind(this);
            }
            this.renderer.domElement.removeEventListener('pointerdown', this.onMouseClick);
            this.renderer.domElement.addEventListener('pointerdown', this.onMouseClick);
        } else {
            this.deselect();
            if (this.onMouseClick) {
                this.renderer.domElement.removeEventListener('pointerdown', this.onMouseClick);
            }
        }
    }

    /**
     * Sets the transformation mode for the Gizmo.
     * @param {'translate'|'rotate'|'scale'} mode
     */
    setTransformMode(mode) {
        if (this.transformControl) {
            this.transformControl.setMode(mode);
        }
    }

    // --- PUBLIC API ---

    /**
     * Loads a Minecraft skin from a URL or DataURI.
     * @param {string} imageUrl - URL to the png skin file.
     * @returns {Promise<boolean>} Resolves to true if the skin is Slim (Alex), false if Classic (Steve).
     */
    loadSkin(imageUrl) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin('anonymous');
            loader.load(imageUrl, (texture) => {
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                texture.colorSpace = THREE.SRGBColorSpace;

                const currentPose = this.skinModel.getPose();
                if (this.config.isEditor) this.deselect();

                const isSlim = detectSlimSkin(texture.image);
                this.skinModel.build(texture, isSlim);
                this.skinModel.setPose(currentPose);

                resolve(isSlim);
            }, undefined, reject);
        });
    }

    /**
     * Loads a skin by Minecraft Username using Minotar API.
     * @param {string} username
     */
    loadSkinByUsername(username) {
        const url = `https://minotar.net/skin/${username}.png?v=${Date.now()}`;
        return this.loadSkin(url);
    }

    /**
     * Applies a pose to the model.
     * @param {Object} poseData - The pose object (rotation/position per body part).
     */
    setPose(poseData) {
        if (this.config.isEditor) this.saveHistory();
        this.skinModel.setPose(poseData);
    }

    /**
     * Returns the current pose of the model.
     * @returns {Object} Pose data.
     */
    getPose() {
        return this.skinModel.getPose();
    }

    /**
     * Updates visual effects configuration.
     * @param {Object} config - Effects config object.
     * @param {Object} config.backlight - Settings for the glow effect.
     */
    updateEffects(config) {
        if (config.backlight) {
            const bl = config.backlight;
            this.skinModel.setGlowEffect(bl.enabled);
            this.skinModel.updateBorderThickness(bl.thickness);
            this.skinModel.updateGlowHeight(bl.height);
            this.postProcessor.setBloom(bl.enabled, bl.strength, bl.radius, 0.1);
        }
    }

    // --- ITEM MANAGEMENT ---

    /**
     * Adds an extruded 3D item from a 2D texture.
     * @param {string} imageUrl - URL to the item texture (png).
     * @param {string} name - Name of the item.
     * @returns {Promise<THREE.Mesh>} The created mesh.
     */
    addItem(imageUrl, name) {
        if (this.config.isEditor) this.saveHistory();

        return ItemFactory.createFromURL(imageUrl, name).then(mesh => {
            mesh.position.set(8, 8, 8);
            this.scene.add(mesh);
            this.items.push(mesh);
            if (this.config.isEditor) {
                this.selectObject(mesh);
            }
            return mesh;
        });
    }

    /**
     * Removes an item from the scene.
     * @param {THREE.Mesh} mesh - The item mesh to remove.
     */
    removeItem(mesh) {
        if (this.config.isEditor) this.saveHistory();
        this.scene.remove(mesh);
        this.items = this.items.filter(i => i !== mesh);
        if (this.config.isEditor) {
            this.deselect();
        }
    }

    // --- INTERACTION ---

    selectObject(object) {
        if (!this.transformControl) return;
        this.transformControl.attach(object);
        this.postProcessor.setSelected(object);
        if (this.onSelectionChanged) this.onSelectionChanged(object);
    }

    deselect() {
        if (!this.transformControl) return;
        this.transformControl.detach();
        this.postProcessor.setSelected(null);
        if (this.onSelectionChanged) this.onSelectionChanged(null);
    }

    setSelectionCallback(cb) { this.onSelectionChanged = cb; }

    onMouseClick(event) {
        if (!this.config.isEditor || !this.transformControl || this.transformControl.dragging) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.cameraManager.camera);
        const objectsToCheck = [...this.skinModel.getGroup().children, ...this.items];
        const intersects = this.raycaster.intersectObjects(objectsToCheck, true);

        if (intersects.length > 0) {
            let target = intersects[0].object;
            const skinGroup = this.skinModel.getGroup();
            let temp = target;
            while(temp) {
                if (temp.parent === skinGroup) {
                    target = temp;
                    break;
                }
                temp = temp.parent;
            }
            if (this.transformControl.object !== target) this.selectObject(target);
        } else {
            this.deselect();
        }
    }

    // --- HISTORY MANAGEMENT ---

    getSnapshot() {
        const pose = this.skinModel.getPose();
        const itemsState = this.items.map(item => ({
            name: item.name,
            uuid: item.uuid,
            pos: [item.position.x, item.position.y, item.position.z],
            rot: [item.rotation.x, item.rotation.y, item.rotation.z],
            scale: [item.scale.x, item.scale.y, item.scale.z]
        }));
        return { pose, items: itemsState };
    }

    restoreSnapshot(state) {
        if (!state) return;
        if (state.pose) this.skinModel.setPose(state.pose);
        if (state.items && Array.isArray(state.items)) {
            state.items.forEach(itemState => {
                const targetItem = this.items.find(i => i.uuid === itemState.uuid) ||
                    this.items.find(i => i.name === itemState.name);
                if (targetItem) {
                    targetItem.position.set(...itemState.pos);
                    targetItem.rotation.set(...itemState.rot);
                    targetItem.scale.set(...itemState.scale);
                }
            });
        }
        if (this.onEditCallback) this.onEditCallback(this.skinModel.getPose());
    }

    saveHistory() { if (this.history) this.history.pushState(this.getSnapshot()); }
    undo() { if (this.history) this.history.undo(this.getSnapshot()); }
    redo() { if (this.history) this.history.redo(this.getSnapshot()); }
    restoreState(state) { this.restoreSnapshot(state); }

    // --- MAIN LOOP ---

    animate() {
        if (this.isDisposed) return;

        requestAnimationFrame(this.animate);
        this.cameraManager.update();

        this.postProcessor.renderSelective(
            // 1. Prepare Bloom (Darken body, hide grid/items)
            () => {
                this.skinModel.darkenBody();
                if (this.sceneSetup.gridHelper) this.sceneSetup.gridHelper.visible = false;
                this.items.forEach(i => i.material = this.skinModel.blackMaterial);
            },
            // 2. Restore Scene
            () => {
                this.skinModel.restoreBody();
                if (this.sceneSetup.gridHelper) this.sceneSetup.gridHelper.visible = this.config.showGrid;
                this.items.forEach(i => { if(i.userData.originalMat) i.material = i.userData.originalMat; });
            }
        );

        if (this.config.isEditor && this.overlayScene) {
            this.renderer.clearDepth();
            this.renderer.render(this.overlayScene, this.cameraManager.camera);
        }
    }

    /**
     * Captures a transparent PNG screenshot of the current scene.
     * @param {number} [width] - Optional output width.
     * @param {number} [height] - Optional output height.
     * @returns {string} Base64 Data URL of the image.
     */
    captureScreenshot(width, height) {
        const originalSize = new THREE.Vector2();
        this.renderer.getSize(originalSize);
        const originalAspect = this.cameraManager.camera.aspect;

        if (width && height) {
            this.renderer.setSize(width, height);
            this.cameraManager.camera.aspect = width / height;
            this.cameraManager.camera.updateProjectionMatrix();
            this.postProcessor.resize(width, height);
        }

        // Save State
        const prevGrid = this.sceneSetup.gridHelper ? this.sceneSetup.gridHelper.visible : false;
        const prevBg = this.scene.background;
        const prevSel = this.postProcessor.outlinePass.selectedObjects;
        const prevClearColor = new THREE.Color();
        this.renderer.getClearColor(prevClearColor);
        const prevClearAlpha = this.renderer.getClearAlpha();

        // Prepare Scene
        this.postProcessor.setSelected(null);
        if (this.sceneSetup.gridHelper) this.sceneSetup.gridHelper.visible = false;
        if (this.transformControl) this.transformControl.visible = false;

        this.scene.background = null;
        this.renderer.setClearColor(0x000000, 0);

        // Render
        try {
            this.postProcessor.renderSelective(
                () => {
                    this.skinModel.darkenBody();
                    this.items.forEach(i => i.material = this.skinModel.blackMaterial);
                },
                () => {
                    this.skinModel.restoreBody();
                    this.items.forEach(i => { if(i.userData.originalMat) i.material = i.userData.originalMat; });
                }
            );
        } catch (e) {
            console.error("Render error", e);
        }

        const dataUrl = this.renderer.domElement.toDataURL("image/png");

        // Restore State
        this.scene.background = prevBg;
        this.renderer.setClearColor(prevClearColor, prevClearAlpha);
        if (this.sceneSetup.gridHelper) this.sceneSetup.gridHelper.visible = prevGrid;
        this.postProcessor.outlinePass.selectedObjects = prevSel;
        if (this.transformControl) this.transformControl.visible = true;

        if (width && height) {
            this.renderer.setSize(originalSize.x, originalSize.y);
            this.cameraManager.camera.aspect = originalAspect;
            this.cameraManager.camera.updateProjectionMatrix();
            this.postProcessor.resize(originalSize.x, originalSize.y);
        }

        this.cameraManager.update();
        return dataUrl;
    }
}