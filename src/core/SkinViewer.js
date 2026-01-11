import * as THREE from 'three';
import { CameraManager } from '../managers/CameraManager.js';
import { SceneSetup } from '../objects/SceneSetup.js';
import { SkinModel } from '../objects/SkinModel.js';
import { detectSlimSkin } from '../utils/SkinUtils.js';
import {disposeObjectTree} from "../utils/ThreeUtils.js";

/**
 * Core 3D Viewer class.
 * Lightweight, modular engine that handles the basic Three.js scene, camera, and character model.
 * Extended functionality (Editor, Effects, Items) is added via Plugins.
 */
export class SkinViewer {
    /**
     * @param {HTMLElement} containerElement - The DOM element to attach the canvas to.
     * @param {Object} [config] - Basic configuration.
     * @param {boolean} [config.showGrid=true] - Visibility of the floor grid.
     * @param {boolean} [config.transparent=false] - Background transparency.
     * @param {number} [config.bgColor=0x141417] - Background hex color.
     * @param {boolean} [config.cameraEnabled=true] - OrbitControls state.
     * @param {boolean} [config.renderPaused=false] - If true, rendering only happens on interaction/change.
     */
    constructor(containerElement, config = {}) {
        this.container = containerElement;
        this.config = {
            showGrid: config.showGrid ?? true,
            transparent: config.transparent ?? false,
            bgColor: config.bgColor ?? 0x141417,
            cameraEnabled: config.cameraEnabled ?? true,
            renderPaused: config.renderPaused ?? false,
            ...config
        };

        /** @type {Map<string, Object>} Registered plugins. */
        this.plugins = new Map();

        /** @type {boolean} Flag to stop the animation loop. */
        this.isDisposed = false;

        this.isVisible = true;
        this.needsRender = true;

        // --- 1. RENDERER SETUP ---
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: this.config.transparent,
            preserveDrawingBuffer: true
        });

        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.autoClear = false; // Required for post-processing plugins

        this.container.appendChild(this.renderer.domElement);

        // --- 2. SCENE SETUP ---
        this.scene = new THREE.Scene();
        if (!this.config.transparent) {
            this.scene.background = new THREE.Color(this.config.bgColor);
        }

        this.overlayScene = new THREE.Scene();

        this.sceneSetup = new SceneSetup(this.scene);
        this.sceneSetup.setGridVisible(this.config.showGrid);

        this.cameraManager = new CameraManager(this.renderer.domElement, w, h, () => {
            this.needsRender = true;
        });
        this.cameraManager.setEnabled(this.config.cameraEnabled);

        this.skinModel = new SkinModel();
        this.scene.add(this.skinModel.getGroup());

        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                this.isVisible = true;
                this.needsRender = true;
                this.animate();
            } else {
                this.isVisible = false;
            }
        }, { threshold: 0 });
        this.observer.observe(this.container);

        // --- 3. START LOOP ---
        this.animate = this.animate.bind(this);
        this.animate();
    }

    /**
     * Manually requests a frame to be rendered.
     * Use this when changing model properties via code.
     */
    requestRender() {
        this.needsRender = true;
    }

    /**
     * Registers and initializes a plugin.
     * @param {Object} plugin - The plugin instance (must have an init() method).
     * @returns {Object} The registered plugin instance.
     */
    addPlugin(plugin) {
        const name = plugin.name || plugin.constructor.name;
        if (this.plugins.has(name)) return this.plugins.get(name);

        if (plugin.init) plugin.init(this);
        this.plugins.set(name, plugin);
        this.requestRender();

        return plugin;
    }

    /**
     * Retrieves a registered plugin by class name.
     * @param {string} name - e.g., 'EditorPlugin', 'EffectsPlugin'.
     * @returns {Object|undefined}
     */
    getPlugin(name) {
        return this.plugins.get(name);
    }

    /**
     * Loads a skin from URL.
     * @param {string} imageUrl
     * @returns {Promise<boolean>} isSlim
     */
    loadSkin(imageUrl) {
        return new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(imageUrl, (texture) => {
                texture.magFilter = THREE.NearestFilter;
                texture.colorSpace = THREE.SRGBColorSpace;

                const currentPose = this.skinModel.getPose();
                const isSlim = detectSlimSkin(texture.image);

                const editor = this.getPlugin('EditorPlugin');
                if (editor) editor.deselect();

                this.skinModel.build(texture, isSlim);
                this.skinModel.setPose(currentPose);
                this.skinData = { type: 'url', value: imageUrl };

                this.requestRender();
                resolve(isSlim);
            }, undefined, reject);
        });
    }

    loadSkinByUsername(username) {
        this.skinData = { type: 'username', value: username };
        const url = `https://minotar.net/skin/${username}.png?v=${Date.now()}`;

        return this.loadSkin(url).then(res => {
            this.skinData = { type: 'username', value: username };
            return res;
        });
    }

    setPose(poseData) {
        // Record history if Editor is present
        const editor = this.getPlugin('EditorPlugin');
        if (editor) editor.saveHistory();

        this.skinModel.setPose(poseData);
        this.requestRender();
    }

    /**
     * Handles window resize. Should be called by the implementation layer.
     */
    onResize() {
        if (!this.container) return;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        this.cameraManager.onResize(w, h);
        this.renderer.setSize(w, h);

        // Notify all plugins
        this.plugins.forEach(p => {
            if (p.onResize) p.onResize(w, h);
        });

        this.requestRender();
    }

    animate() {
        if (this.isDisposed || !this.isVisible) return;
        requestAnimationFrame(this.animate);

        this.cameraManager.update();

        if (this.config.renderPaused && !this.needsRender) {
            return;
        }

        const effects = this.getPlugin('EffectsPlugin');

        if (effects) {
            effects.render();
        } else {
            this.renderer.clear();
            this.renderer.render(this.scene, this.cameraManager.camera);
        }

        this.renderer.clearDepth();
        this.renderer.render(this.overlayScene, this.cameraManager.camera);

        this.needsRender = false;
    }

    dispose() {
        this.isDisposed = true;
        this.observer.disconnect();

        this.plugins.forEach(p => {
            if (p.dispose) p.dispose();
        });
        this.plugins.clear();

        if (this.skinModel) {
            this.skinModel.dispose();
        }

        disposeObjectTree(this.scene);
        disposeObjectTree(this.overlayScene);

        if (this.cameraManager) {
            this.cameraManager.controls.dispose();
        }

        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();

            if (this.container && this.renderer.domElement) {
                this.container.removeChild(this.renderer.domElement);
            }
            this.renderer.domElement = null;
            this.renderer = null;
        }
    }
}