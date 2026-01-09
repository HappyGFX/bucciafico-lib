import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';

/**
 * Handles the post-processing pipeline (Bloom, Outline, Color Correction).
 */
export class PostProcessingManager {
    constructor(renderer, scene, camera, width, height) {
        this.scene = scene;
        this.renderer = renderer;

        this.INTERNAL_HEIGHT = 1080;

        const ratio = width / height;
        const virtualW = this.INTERNAL_HEIGHT * ratio;
        const virtualH = this.INTERNAL_HEIGHT;

        // 1. BLOOM COMPOSER (Renders glow map)
        this.bloomComposer = new EffectComposer(renderer);
        this.bloomComposer.renderToScreen = false;
        this.bloomComposer.setSize(virtualW, virtualH);
        this.bloomComposer.addPass(new RenderPass(scene, camera));

        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
        this.bloomComposer.addPass(this.bloomPass);

        // 2. FINAL COMPOSER
        this.finalComposer = new EffectComposer(renderer);
        this.finalComposer.setSize(width, height);
        this.finalComposer.addPass(new RenderPass(scene, camera));

        // 3. OUTLINE PASS (Selection highlight)
        this.outlinePass = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
        this.outlinePass.edgeStrength = 3.0;
        this.outlinePass.visibleEdgeColor.set('#ffffff');
        this.outlinePass.hiddenEdgeColor.set('#ffffff');
        this.finalComposer.addPass(this.outlinePass);

        // 4. MIX SHADER (Combines Base + Bloom preserving Alpha)
        const MixShader = {
            uniforms: {
                tDiffuse: { value: null },
                bloomTexture: { value: null }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform sampler2D bloomTexture;
                varying vec2 vUv;
                
                void main() {
                    vec4 baseColor = texture2D(tDiffuse, vUv);
                    vec4 bloomColor = texture2D(bloomTexture, vUv);
                    
                    vec3 bloomRGB = bloomColor.rgb;
                    float brightness = max(bloomRGB.r, max(bloomRGB.g, bloomRGB.b));
                    
                    if (brightness < 0.15) {
                        bloomRGB = vec3(0.0);
                        brightness = 0.0;
                    } else {
                        bloomRGB = (bloomRGB - 0.15) * 1.2; 
                    }

                    vec3 finalColor = baseColor.rgb + (bloomRGB * 2.0);
                    float glowAlpha = clamp(brightness, 0.0, 1.0);
                    float finalAlpha = max(baseColor.a, glowAlpha);

                    gl_FragColor = vec4(finalColor, finalAlpha);
                }
            `
        };

        this.mixPass = new ShaderPass(MixShader);
        this.mixPass.needsSwap = true;
        this.finalComposer.addPass(this.mixPass);

        // 5. OUTPUT PASS (sRGB correction)
        this.finalComposer.addPass(new OutputPass());
    }

    resize(width, height) {
        const ratio = width / height;

        const virtualH = this.INTERNAL_HEIGHT;
        const virtualW = virtualH * ratio;

        this.bloomComposer.setSize(virtualW, virtualH);
        this.finalComposer.setSize(width, height);
        this.bloomPass.resolution.set(virtualW, virtualH);
        this.outlinePass.setSize(width, height);
    }

    /**
     * Renders the scene in two passes to achieve the glow effect on specific objects only.
     * @param {Function} prepareBloomCb - Callback to hide non-glowing objects.
     * @param {Function} restoreSceneCb - Callback to restore visibility.
     */
    renderSelective(prepareBloomCb, restoreSceneCb) {
        const prevBg = this.scene.background;
        this.scene.background = new THREE.Color(0x000000);
        this.outlinePass.enabled = false;

        prepareBloomCb();
        this.bloomComposer.render();
        restoreSceneCb();

        this.scene.background = prevBg;
        this.outlinePass.enabled = true;
        this.mixPass.uniforms.bloomTexture.value = this.bloomComposer.readBuffer.texture;
        this.finalComposer.render();
    }

    setSelected(obj) {
        this.outlinePass.selectedObjects = obj ? [obj] : [];
    }

    setBloom(en, str, rad, thr) {
        this.bloomPass.strength = en ? Number(str) : 0;
        this.bloomPass.radius = Number(rad);
        this.bloomPass.threshold = Number(thr);
    }
}