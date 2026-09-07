import {renderPlan} from '../utils/RenderOutput.js';
import {DEFAULT_GLOW_SETTINGS} from '../utils/GlowConfig.js';
import {DEFAULT_AO, DEFAULT_DOF, normalizePostEffect} from '../utils/PostEffectsConfig.js';
import * as THREE from 'three';
import {PostProcessingManager} from '../managers/PostProcessingManager.js';

/**
 * Plugin responsible for visual effects and post-processing.
 * Handles Bloom (Glow), Outlines, and high-res Screenshots.
 */
export class EffectsPlugin {
    constructor() {
        this.name = 'EffectsPlugin';
        this.state = {...DEFAULT_GLOW_SETTINGS, ao:{...DEFAULT_AO}, dof:{...DEFAULT_DOF}};
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
     * @param {Object} config - { enabled, strength, radius, height, thickness, innerGlow, outerGlow }
     */
    updateConfig(config) {
        this.state = {...this.state, ...config,
            ao:normalizePostEffect('ao', this.state.ao, config.ao),
            dof:normalizePostEffect('dof', this.state.dof, config.dof)};
        for (const key of ['innerGlow', 'outerGlow']) {
            this.state[key] = Number.isFinite(this.state[key])
                ? THREE.MathUtils.clamp(this.state[key], 0, 2) : DEFAULT_GLOW_SETTINGS[key];
        }

        this._applyToScene();
    }

    /**
     * Re-applies the current internal state to the 3D model.
     * Useful when the model has been rebuilt (skin change).
     */
    forceUpdate() {
        this._applyToScene();
    }

    /**
     * Internal method to push state to shaders and composer.
     */
    _applyToScene() {
        const config = this.state;
        const skin = this.viewer.skinModel;
        skin.updateBones();

        for (const {model} of this.viewer.characters) {
            model.setGlowEffect(config.enabled, config.strength);
            model.updateBorderThickness(config.thickness);
            model.updateGlowHeight(config.height);
        }

        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin) {
            itemsPlugin.updateAllGlow(config);
        }

        this.composer.setBloom(config.enabled, config.strength, config.radius, 0.1, config.innerGlow, config.outerGlow);
        this.composer.depthEffects.configure(config.ao, config.dof);
        this.viewer.requestRender();
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
        this.viewer.characters.forEach(c => c.model.updateBones());
        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        const items = itemsPlugin ? itemsPlugin.items : [];
        itemsPlugin?.updateWorldGlow();
        this.viewer.sceneSetup.updateShadows();
        this.composer.depthEffects.render(this.viewer.renderer,
            [...this.viewer.characters.map(c=>c.model.playerGroup), ...items], this.viewer.cameraManager.controls.target);
        const equipmentMaterials = new Map();

        this.composer.renderSelective(
            () => {
                this.viewer.characters.forEach(c => c.model.darkenBody());
                this.viewer.sceneSetup.setGridVisible(false);
                items.forEach(item => item.traverse(mesh => {
                    if (!mesh.isMesh || mesh.userData.isGlowLayer) return;
                    equipmentMaterials.set(mesh, mesh.material);
                    // Keep texture alpha and face settings in the bloom occlusion pass.
                    if (!mesh.userData.darkMat) {
                        const darken = material => {
                            const dark = material.clone();
                            dark.color?.set(0);
                            dark.emissive?.set(0);
                            return dark;
                        };
                        mesh.userData.darkMat = Array.isArray(mesh.material)
                            ? mesh.material.map(darken) : darken(mesh.material);
                    }
                    mesh.material = mesh.userData.darkMat;
                }));
            },
            () => {
                this.viewer.characters.forEach(c => c.model.restoreBody());
                this.viewer.sceneSetup.setGridVisible(this.viewer.config.showGrid);
                equipmentMaterials.forEach((material, mesh) => {
                    mesh.material = material;
                });
            }
        );
    }

    /**
     * Returns the current configuration state.
     */
    getConfig() {
        return {...this.state, ao:{...this.state.ao}, dof:{...this.state.dof}};
    }

    /**
     * Generates a transparent PNG screenshot.
     * Temporarily resizes renderer if width/height are provided.
     */
    captureScreenshot(width,height,options={}) {
        return this.captureCanvas(width,height,options).toDataURL('image/png');
    }
    captureCanvas(width,height,options={}) {
        const viewer=this.viewer,renderer=viewer.renderer,camera=viewer.cameraManager.camera;
        const size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
        width=width||size.x;height=height||size.y;
        const plan=renderPlan(renderer,width,height,options.quality||'standard');
        const aspect=camera.aspect,grid=viewer.config.showGrid,bg=viewer.scene.background,selection=this.composer.outlinePass.selectedObjects;
        const color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
        const targets=[this.composer.bloomComposer,this.composer.finalComposer].flatMap(c=>[c.renderTarget1,c.renderTarget2]);
        const samples=targets.map(t=>t.samples);
        try {
            targets.forEach(t=>{if(t.samples!==plan.samples){t.samples=plan.samples;t.dispose();}});
            renderer.setPixelRatio(1);renderer.setSize(plan.width,plan.height,false);
            camera.aspect=width/height;camera.updateProjectionMatrix();this.composer.resize(plan.width,plan.height);
            this.composer.setSelected(null);viewer.config.showGrid=false;viewer.sceneSetup.setGridVisible(false);
            viewer.scene.background=options.background==='solid'?new THREE.Color(options.backgroundColor||'#141417'):null;
            renderer.setClearColor(options.backgroundColor||'#141417',options.background==='solid'?1:0);
            this.render();
            const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
            const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
            context.drawImage(renderer.domElement,0,0,width,height);return canvas;
        } finally {
            viewer.scene.background=bg;renderer.setClearColor(color,alpha);viewer.config.showGrid=grid;viewer.sceneSetup.setGridVisible(grid);
            this.composer.outlinePass.selectedObjects=selection;
            targets.forEach((t,i)=>{if(t.samples!==samples[i]){t.samples=samples[i];t.dispose();}});
            renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);camera.aspect=aspect;camera.updateProjectionMatrix();this.composer.resize(size.x,size.y);
            viewer.cameraManager.update();viewer.requestRender();
        }
    }

    dispose() {
        if (this.composer) {
            this.composer.dispose();
            this.composer = null;
        }
    }

}
