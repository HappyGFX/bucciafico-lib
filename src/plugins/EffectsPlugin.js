import * as THREE from 'three';
import { PostProcessingManager } from '../managers/PostProcessingManager.js';

/**
 * Plugin responsible for visual effects and post-processing.
 * Handles Bloom (Glow), Outlines, and high-res Screenshots.
 */
export class EffectsPlugin {
    constructor() {
        this.name = 'EffectsPlugin';
        this.isEnabled = false;
    }

    init(viewer) {
        this.viewer = viewer;
        const w = viewer.container.clientWidth;
        const h = viewer.container.clientHeight;

        this.composer = new PostProcessingManager(viewer.renderer, viewer.scene, viewer.cameraManager.camera, w, h);

        this.composer.setBloom(false, 0, 0, 0.1);
    }

    /**
     * Updates effect parameters.
     * @param {Object} config - { enabled, strength, radius, height, thickness }
     */
    updateConfig(config) {
        this.isEnabled = config.enabled;
        const skin = this.viewer.skinModel;

        // Update Shader Materials
        skin.setGlowEffect(config.enabled);
        if (config.thickness !== undefined) skin.updateBorderThickness(config.thickness);
        if (config.height !== undefined) skin.updateGlowHeight(config.height);

        // Update Composer Pass
        this.composer.setBloom(config.enabled, config.strength, config.radius, 0.85);
    }

    /**
     * Highlights an object (used by EditorPlugin).
     */
    setSelected(obj) {
        this.composer.setSelected(obj);
    }

    onResize(w, h) {
        this.composer.resize(w, h);
    }

    /**
     * Custom render loop called by the Core animate().
     */
    render() {
        const skin = this.viewer.skinModel;
        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        const items = itemsPlugin ? itemsPlugin.items : [];

        this.composer.renderSelective(
            // 1. Prepare Bloom pass (Hide non-glowing elements)
            () => {
                skin.darkenBody();
                this.viewer.sceneSetup.setGridVisible(false);
                items.forEach(i => i.material = skin.blackMaterial);
            },
            // 2. Restore Scene for main pass
            () => {
                skin.restoreBody();
                this.viewer.sceneSetup.setGridVisible(this.viewer.config.showGrid);
                items.forEach(i => {
                    if(i.userData.originalMat) i.material = i.userData.originalMat;
                });
            }
        );
    }

    /**
     * Generates a transparent PNG screenshot.
     * Temporarily resizes renderer if width/height are provided.
     */
    captureScreenshot(width, height) {
        const renderer = this.viewer.renderer;
        const camera = this.viewer.cameraManager.camera;

        const originalSize = new THREE.Vector2();
        renderer.getSize(originalSize);
        const originalAspect = camera.aspect;

        if (width && height) {
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            this.composer.resize(width, height);
        }

        const wasGridEnabled = this.viewer.config.showGrid;
        const prevBg = this.viewer.scene.background;
        const prevSel = this.composer.outlinePass.selectedObjects;
        const prevClearColor = new THREE.Color();
        renderer.getClearColor(prevClearColor);
        const prevClearAlpha = renderer.getClearAlpha();

        this.composer.setSelected(null);

        this.viewer.config.showGrid = false;
        this.viewer.sceneSetup.setGridVisible(false);

        this.viewer.scene.background = null;
        renderer.setClearColor(0x000000, 0);

        this.render();

        const dataUrl = renderer.domElement.toDataURL("image/png");

        this.viewer.scene.background = prevBg;
        renderer.setClearColor(prevClearColor, prevClearAlpha);

        this.viewer.config.showGrid = wasGridEnabled;
        this.viewer.sceneSetup.setGridVisible(wasGridEnabled);

        this.composer.outlinePass.selectedObjects = prevSel;

        if (width && height) {
            renderer.setSize(originalSize.x, originalSize.y);
            camera.aspect = originalAspect;
            camera.updateProjectionMatrix();
            this.composer.resize(originalSize.x, originalSize.y);
        }

        this.viewer.cameraManager.update();
        return dataUrl;
    }

    getConfig() {
        const skin = this.viewer.skinModel;
        const glowMesh = skin.glowMeshes[0];

        return {
            enabled: this.isEnabled,
            strength: this.composer.bloomPass.strength,
            radius: this.composer.bloomPass.radius,

            height: glowMesh ? glowMesh.userData.glowMat.uniforms.gradientLimit.value : 0.5,
            thickness: glowMesh ? glowMesh.userData.glowMat.uniforms.thickness.value / 0.05 : 4
        };
    }

    dispose() {
        if (this.composer) {
            this.composer.dispose();
            this.composer = null;
        }
    }

}