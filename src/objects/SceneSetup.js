import * as THREE from 'three';

/**
 * Initializes basic scene elements: Lights and Grid.
 */
export class SceneSetup {
    constructor(scene) {
        this.scene = scene;
        this.gridHelper = null;
        this.initLights();
        this.initHelpers();
    }

    initLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.5));
        const dl = new THREE.DirectionalLight(0xffffff, 0.8);
        dl.position.set(10, 20, 10);
        this.scene.add(dl);
        const fl = new THREE.DirectionalLight(0xffffff, 0.4);
        fl.position.set(0, 0, 20);
        this.scene.add(fl);
    }

    initHelpers() {
        this.gridHelper = new THREE.GridHelper(2000, 125, 0x333333, 0x111111);
        this.gridHelper.position.y = -24;
        this.scene.add(this.gridHelper);
    }

    setGridVisible(vis) { if(this.gridHelper) this.gridHelper.visible = vis; }
}