import * as THREE from 'three';

export const MINECRAFT_LIGHTING = {
    global: 1.2, main: 3, fill: 0.8,
    shadows: true, shadowStrength: 0.65, shadowSoftness: 1,
    sunAzimuth: -45, sunElevation: 55,
};

export class SceneSetup {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.lightConfig = { global: 0.8, main: 0.8, fill: 0.4, shadows: false,
            shadowStrength: 0.65, shadowSoftness: 1, sunAzimuth: 45, sunElevation: 55 };
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        this.dirLightMain = new THREE.DirectionalLight(0xffffff, 0.8);
        // Same direction, without shadows: keeps brightness independent of shadow strength.
        this.sunFill = new THREE.DirectionalLight(0xffffff, 0);
        this.dirLightFill = new THREE.DirectionalLight(0xffffff, 0.4);
        this.dirLightFill.position.set(0, 0, 20);
        this.scene.add(this.ambientLight, this.hemiLight, this.dirLightMain, this.sunFill,
            this.dirLightFill, this.dirLightMain.target, this.sunFill.target);
        this.dirLightMain.shadow.mapSize.set(2048, 2048);
        this.dirLightMain.shadow.bias = -0.00005;
        this.dirLightMain.shadow.normalBias = 0.025;
        if (renderer) {
            renderer.shadowMap.type = THREE.PCFShadowMap;
            renderer.shadowMap.autoUpdate = false;
        }
        this.setLightConfig({});
        this.gridHelper = new THREE.GridHelper(2000, 125, 0x8b5cf6, 0x222222);
        this.gridHelper.position.y = -24;
        this.scene.add(this.gridHelper);
    }

    setGridVisible(vis) { this.gridHelper.visible = vis; }

    setLightConfig(config) {
        const ranges = { global:[0,3], main:[0,3], fill:[0,3], shadowStrength:[0,1],
            shadowSoftness:[0,4], sunAzimuth:[-180,180], sunElevation:[5,90] };
        for (const [key,[min,max]] of Object.entries(ranges)) {
            if (Number.isFinite(config[key])) this.lightConfig[key] = THREE.MathUtils.clamp(config[key],min,max);
        }
        if (typeof config.shadows === 'boolean') this.lightConfig.shadows = config.shadows;
        const c = this.lightConfig;
        this.ambientLight.intensity = c.global;
        this.hemiLight.intensity = c.global * 0.6;
        this.dirLightFill.intensity = c.fill;
        this.dirLightMain.intensity = c.main * (c.shadows ? c.shadowStrength : 1);
        this.sunFill.intensity = c.shadows ? c.main * (1-c.shadowStrength) : 0;
        this.dirLightMain.castShadow = c.shadows;
        this.dirLightMain.shadow.radius = c.shadowSoftness;
        if (this.renderer) this.renderer.shadowMap.enabled = c.shadows;
        this.positionSun(new THREE.Vector3(), 100);
    }

    positionSun(center, distance) {
        const az = THREE.MathUtils.degToRad(this.lightConfig.sunAzimuth);
        const el = THREE.MathUtils.degToRad(this.lightConfig.sunElevation);
        const offset = new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(distance);
        for (const light of [this.dirLightMain,this.sunFill]) {
            light.position.copy(center).add(offset);
            light.target.position.copy(center);
            light.target.updateMatrixWorld();
            light.updateMatrixWorld();
        }
    }

    updateShadows() {
        if (!this.lightConfig.shadows || !this.renderer) return;
        this.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3();
        this.scene.traverseVisible(mesh => {
            if (!mesh.isMesh || !mesh.geometry || mesh.userData.isGlow || mesh.userData.isGlowLayer) return;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            // Positions may have changed through elbow/knee/torso deformation.
            mesh.geometry.computeBoundingBox();
            bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
        });
        if (bounds.isEmpty()) return;
        const center = bounds.getCenter(new THREE.Vector3());
        const radius = Math.max(bounds.getSize(new THREE.Vector3()).length()/2, 8);
        this.positionSun(center, radius*2+20);
        const camera = this.dirLightMain.shadow.camera;
        camera.position.copy(this.dirLightMain.position);
        camera.lookAt(center);
        camera.updateMatrixWorld();
        const lightBounds = bounds.clone().applyMatrix4(camera.matrixWorldInverse);
        const pad = Math.max(1, radius*0.03);
        camera.left = lightBounds.min.x-pad; camera.right = lightBounds.max.x+pad;
        camera.bottom = lightBounds.min.y-pad; camera.top = lightBounds.max.y+pad;
        camera.near = Math.max(0.1,-lightBounds.max.z-pad);
        camera.far = -lightBounds.min.z+pad;
        camera.updateProjectionMatrix();
        this.renderer.shadowMap.needsUpdate = true;
    }

    getLightConfig() { return {...this.lightConfig}; }
    dispose() { this.dirLightMain.shadow.dispose(); }
}
