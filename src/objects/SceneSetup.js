import * as THREE from 'three';

/**
 * Initializes basic scene elements: Lights and Grid.
 */
export class SceneSetup {
    constructor(scene) {
        this.scene = scene;
        this.gridHelper = null;

        this.ambientLight = null;
        this.hemiLight = null;
        this.dirLightMain = null;
        this.dirLightFill = null;

        this.initLights();
        this.initHelpers();
    }

    initLights() {
        // 1. Global Illumination
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(this.ambientLight);

        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        this.scene.add(this.hemiLight);

        // 2. Directional Lights (Shadows & Definition)
        this.dirLightMain = new THREE.DirectionalLight(0xffffff, 0.8);
        this.dirLightMain.position.set(10, 20, 10);
        this.scene.add(this.dirLightMain);

        this.dirLightFill = new THREE.DirectionalLight(0xffffff, 0.4);
        this.dirLightFill.position.set(0, 0, 20);
        this.scene.add(this.dirLightFill);
    }

    initHelpers() {
        this.gridHelper = new THREE.GridHelper(2000, 125, 0x8b5cf6, 0x222222);
        this.gridHelper.position.y = -24;
        this.scene.add(this.gridHelper);
    }

    setGridVisible(vis) { if(this.gridHelper) this.gridHelper.visible = vis; }

    /**
     * Updates the intensity of scene lights.
     * @param {Object} config
     * @param {number} [config.global] - Intensity of Ambient/Hemi lights (0.0 - 2.0)
     * @param {number} [config.main] - Intensity of Main Directional Light (0.0 - 2.0)
     * @param {number} [config.fill] - Intensity of Fill Light (0.0 - 2.0)
     */
    setLightConfig(config) {
        if (config.global !== undefined) {
            this.ambientLight.intensity = config.global;
            this.hemiLight.intensity = config.global * 0.6;
        }
        if (config.main !== undefined) {
            this.dirLightMain.intensity = config.main;
        }
        if (config.fill !== undefined) {
            this.dirLightFill.intensity = config.fill;
        }
    }

    getLightConfig() {
        return {
            global: this.ambientLight.intensity,
            main: this.dirLightMain.intensity,
            fill: this.dirLightFill.intensity
        };
    }
}