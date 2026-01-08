import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Wraps Three.js Camera and OrbitControls.
 */
export class CameraManager {

    /**
     * @param {HTMLElement} domElement
     * @param {number} width
     * @param {number} height
     * @param {Function} [onChange] - Callback fired when camera moves
     */
    constructor(domElement, width, height, onChange) {
        this.defaultFOV = 45;
        this.defaultPosition = new THREE.Vector3(20, 10, 40);
        this.defaultTarget = new THREE.Vector3(0, 0, 0);

        this.camera = new THREE.PerspectiveCamera(this.defaultFOV, width / height, 0.1, 1000);
        this.camera.position.copy(this.defaultPosition);

        this.controls = new OrbitControls(this.camera, domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.copy(this.defaultTarget);

        if (onChange) this.controls.addEventListener('change', onChange);
    }

    update() { this.controls.update(); }
    onResize(width, height) { this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); }
    setFOV(value) { this.camera.fov = value; this.camera.updateProjectionMatrix(); }
    setDistance(distance) {
        const direction = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
        this.camera.position.copy(this.controls.target).add(direction.multiplyScalar(distance));
    }
    setEnabled(enabled) { this.controls.enabled = enabled; }
    reset() {
        this.setFOV(this.defaultFOV);
        this.camera.position.copy(this.defaultPosition);
        this.controls.target.copy(this.defaultTarget);
        this.controls.update();
    }
    getSettingsJSON() {
        const r = (val) => parseFloat(val.toFixed(3));
        const rVec = (v) => [r(v.x), r(v.y), r(v.z)];
        return {
            fov: this.camera.fov,
            zoom: r(this.camera.position.distanceTo(this.controls.target)),
            position: rVec(this.camera.position),
            target: rVec(this.controls.target)
        };
    }
    loadSettingsJSON(data) {
        if (data.fov) { this.camera.fov = data.fov; this.camera.updateProjectionMatrix(); }
        if (data.position) this.camera.position.fromArray(data.position);
        if (data.target) this.controls.target.fromArray(data.target);
        this.controls.update();
    }
}