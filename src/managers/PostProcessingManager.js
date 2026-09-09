import * as THREE from 'three';
import {createAntialiasedComposer} from '../utils/Antialiasing.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {OutlinePass} from 'three/examples/jsm/postprocessing/OutlinePass.js';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {DepthEffects} from './DepthEffects.js';

/**
 * Handles the post-processing pipeline (Bloom, Outline, Color Correction).
 */
export class PostProcessingManager {
    constructor(renderer, scene, camera, width, height) {
        this.scene = scene;
        this.emptyBloom=new THREE.DataTexture(new Uint8Array(4),1,1);
        this.emptyBloom.needsUpdate=true;
        this.renderer = renderer;
        this.depthEffects = new DepthEffects(scene, camera);
        this.depthEffects.setSize(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());

        this.INTERNAL_HEIGHT = 1080;

        const ratio = width / height;
        const virtualW = this.INTERNAL_HEIGHT * ratio;
        const virtualH = this.INTERNAL_HEIGHT;

        // 1. BLOOM COMPOSER (Renders glow map)
        this.bloomComposer = createAntialiasedComposer(renderer, width, height);
        this.bloomComposer.renderToScreen = false;
        // Fixed working resolution keeps the halo width stable across DPR and exports.
        this.bloomComposer.setPixelRatio(1);
        this.bloomComposer.setSize(virtualW, virtualH);
        this.bloomComposer.addPass(new RenderPass(scene, camera, null, null, 0));

        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
        this.bloomComposer.addPass(this.bloomPass);

        // 2. FINAL COMPOSER
        this.finalComposer = createAntialiasedComposer(renderer, width, height);
        this.finalComposer.setSize(width, height);
        this.basePass = new RenderPass(scene, camera);
        this.finalComposer.addPass(this.basePass);
        this.finalComposer.addPass(this.depthEffects.aoPass);

        // 3. OUTLINE PASS (Selection highlight)
        this.outlinePass = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
        this.outlinePass.edgeStrength = 3.0;
        this.outlinePass.visibleEdgeColor.set('#ffffff');
        this.outlinePass.hiddenEdgeColor.set('#ffffff');
        this.finalComposer.addPass(this.outlinePass);

        // 4. MIX SHADER (Combines Base + Bloom preserving Alpha)
        const MixShader = {
            uniforms: {
                tDiffuse: {value: null},
                bloomTexture: {value: null}
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
                uniform sampler2D bloomOuterTexture;
                uniform bool splitBloom;
                uniform vec3 backgroundColor;
                uniform float backgroundOpacity;
                uniform float innerGlow;
                uniform float outerGlow;
                varying vec2 vUv;
                
                void main() {
                    vec4 baseColor = texture2D(tDiffuse, vUv);
                    vec4 bloomColor = texture2D(bloomTexture, vUv);
                    
                    // Keep the full blur tail. Thresholding here turns bloom into
                    // a hard contour; the bright-pass already selects its source.
                    vec3 bloomRGB = max(bloomColor.rgb, vec3(0.0));
                    // Most scattered light stays on the model. Only a faint halo
                    // crosses the silhouette; it must not become a white backdrop.
                    float surface = clamp(baseColor.a, 0.0, 1.0);
                    bloomRGB = splitBloom ? mix(0.04 * texture2D(bloomOuterTexture,vUv).rgb, 0.6 * bloomRGB, surface)
                        : bloomRGB * mix(0.04 * outerGlow, 0.6 * innerGlow, surface);
                    vec3 finalColor = baseColor.rgb + bloomRGB;
                    // The canvas is premultiplied in display space. Linear bloom
                    // luminance as alpha would erase its soft halo in exported PNGs.
                    vec3 displayColor = sRGBTransferOETF(vec4(finalColor, 1.0)).rgb;
                    float coverage = clamp(max(displayColor.r, max(displayColor.g, displayColor.b)), 0.0, 1.0);
                    float hasBloom = step(0.000001, max(bloomRGB.r, max(bloomRGB.g, bloomRGB.b)));
                    float finalAlpha = mix(baseColor.a, max(baseColor.a, coverage), hasBloom);
                    finalColor += backgroundColor * backgroundOpacity * (1.0 - baseColor.a);
                    finalAlpha = mix(finalAlpha, 1.0, backgroundOpacity);

                    gl_FragColor = vec4(finalColor, finalAlpha);
                }
            `
        };

        this.mixPass = new ShaderPass(MixShader);
        this.mixPass.uniforms.backgroundColor = {value: new THREE.Color(0)};
        this.mixPass.uniforms.backgroundOpacity = {value: 0};
        this.mixPass.uniforms.bloomOuterTexture = {value:null};
        this.mixPass.uniforms.splitBloom = {value:false};
        this.mixPass.uniforms.innerGlow = {value: 1};
        this.mixPass.uniforms.outerGlow = {value: 1};
        this.mixPass.needsSwap = true;
        this.finalComposer.addPass(this.mixPass);

        // 5. OUTPUT PASS (sRGB correction)
        this.finalComposer.addPass(new OutputPass());
        this.finalComposer.addPass(this.depthEffects.dofPass);
    }

    resize(width, height) {
        const pixelRatio = this.renderer.getPixelRatio();
        this.bloomComposer.setPixelRatio(1);
        this.finalComposer.setPixelRatio(pixelRatio);
        this.depthEffects.setSize(width * pixelRatio, height * pixelRatio);
        const ratio = width / height;

        const virtualH = this.INTERNAL_HEIGHT;
        const virtualW = virtualH * ratio;

        this.bloomComposer.setSize(virtualW, virtualH);
        this.finalComposer.setSize(width, height);
        this.bloomPass.resolution.set(virtualW, virtualH);
        // Composer also resizes selection buffers at the actual pixel ratio.
    }

    /**
     * Renders the scene in two passes to achieve the glow effect on specific objects only.
     * @param {Function} prepareBloomCb - Callback to hide non-glowing objects.
     * @param {Function} restoreSceneCb - Callback to restore visibility.
     */
    renderSelective(prepareBloomCb, restoreSceneCb, groups) {
        const hasBloom=groups?groups.some(({config,layers})=>config.strength>0&&(config.innerGlow>0||config.outerGlow>0)&&layers.size>0):this.bloomPass.strength>0;
        const prevBg = this.scene.background;
        this.scene.background = null;
        this.outlinePass.enabled = false;

        // Both controls use the same unattenuated light source. Turning off the
        // surface highlight must not also turn off the exterior bloom.
        const gains = new Map();
        if(hasBloom)this.scene.traverse(mesh => {
            const gain = mesh.material?.uniforms?.glowGain;
            if (gain) {gains.set(gain, gain.value);gain.value = 1;}
        });
        try {
            if(hasBloom){
                prepareBloomCb();
                if (groups) this.renderObjectBloom(groups);
                else this.bloomComposer.render();
            }
        }
        finally {
            gains.forEach((value, gain) => {gain.value = value;});
            if(hasBloom)restoreSceneCb();this.scene.background=prevBg;this.outlinePass.enabled=true;
        }
        this.outlinePass.enabled = true;
        // UnrealBloomPass also adds its input to readBuffer. Mixing that buffer
        // doubles the sharp shell already present in the base render.
        this.mixPass.uniforms.splitBloom.value = hasBloom&&!!groups;
        this.mixPass.uniforms.bloomTexture.value = !hasBloom?this.emptyBloom:groups ? this.objectBloom[0].texture : this.bloomPass.renderTargetsHorizontal[0].texture;
        if (hasBloom&&groups) this.mixPass.uniforms.bloomOuterTexture.value = this.objectBloom[1].texture;
        // Add solid backgrounds after the light split so geometry alpha remains
        // an exact mask at the final resolution, including antialiased edges.
        const separateBackground = !prevBg || prevBg.isColor;
        this.mixPass.uniforms.backgroundOpacity.value = prevBg?.isColor ? 1 : 0;
        if (prevBg?.isColor) this.mixPass.uniforms.backgroundColor.value.copy(prevBg);
        if (separateBackground) {this.scene.background = null;this.basePass.clearAlpha = 0;}
        try {this.finalComposer.render();}
        finally {this.scene.background = prevBg;this.basePass.clearAlpha = null;}
    }

    renderObjectBloom(groups) {
        const renderer=this.renderer, target=renderer.getRenderTarget(),
            color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),
            width=this.bloomPass.renderTargetsHorizontal[0].width,height=this.bloomPass.renderTargetsHorizontal[0].height;
        if (!this.objectBloom) {
            this.objectBloom=[0,1].map(()=>new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,depthBuffer:false}));
            this.accumulateMaterial=new THREE.ShaderMaterial({
                uniforms:{image:{value:null},gain:{value:1}},depthTest:false,depthWrite:false,transparent:true,
                blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendEquation:THREE.AddEquation,
                vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
                fragmentShader:'uniform sampler2D image;uniform float gain;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(image,vUv).rgb*gain,0.);}'
            });
            this.accumulateQuad=new FullScreenQuad(this.accumulateMaterial);
        }
        const visibility=new Map();
        this.scene.traverse(mesh=>{if(mesh.userData.isGlow||mesh.userData.isGlowLayer)visibility.set(mesh,mesh.visible);});
        try {
            renderer.setClearColor(0,0);
            for(const buffer of this.objectBloom){if(buffer.width!==width||buffer.height!==height)buffer.setSize(width,height);renderer.setRenderTarget(buffer);renderer.clear();}
            for(const {config,layers} of groups) {
                if(!config.strength||(!config.innerGlow&&!config.outerGlow))continue;
                visibility.forEach((visible,mesh)=>{mesh.visible=visible&&layers.has(mesh);});
                this.setBloom(true,config.strength,config.radius,0.1,1,1,false);
                this.bloomComposer.render();
                this.accumulateMaterial.uniforms.image.value=this.bloomPass.renderTargetsHorizontal[0].texture;
                for(let i=0;i<2;i++){
                    this.accumulateMaterial.uniforms.gain.value=i?config.outerGlow:config.innerGlow;
                    renderer.setRenderTarget(this.objectBloom[i]);
                    const auto=renderer.autoClear;renderer.autoClear=false;
                    try{this.accumulateQuad.render(renderer);}finally{renderer.autoClear=auto;}
                }
            }
        } finally {
            visibility.forEach((visible,mesh)=>{mesh.visible=visible;});
            renderer.setRenderTarget(target);renderer.setClearColor(color,alpha);
        }
    }

    setSelected(obj) {
        this.outlinePass.selectedObjects = obj ? [obj] : [];
    }

    setBloom(en, str, rad, thr, innerGlow = 1, outerGlow = 1, applyMaterials = true) {
        this.mixPass.uniforms.innerGlow.value = innerGlow;
        this.mixPass.uniforms.outerGlow.value = outerGlow;
        if (applyMaterials) this.scene.traverse(mesh => {
            const material = mesh.material;
            if (material?.uniforms?.glowGain) {
                material.uniforms.glowGain.value = material.defines?.SURFACE_GLOW ? innerGlow : outerGlow;
            }
        });
        this.bloomPass.strength = en ? Number(str) : 0;
        // Favour the close halo. UnrealBloomPass's default radius interpolation
        // gives its largest mip too much weight, washing out the whole portrait.
        const radius = THREE.MathUtils.clamp(Number(rad) / 2, 0, 1);
        this.bloomPass.radius = 0;
        this.bloomPass.bloomFactors = [1, 0.5 + radius * 0.3, 0.12 + radius * 0.2,
            0.01 + radius * 0.1, 0.002 + radius * 0.025];
        this.bloomPass.compositeMaterial.uniforms.bloomFactors.value = this.bloomPass.bloomFactors;
        this.bloomPass.threshold = Number(thr);
    }

    dispose() {
        this.emptyBloom.dispose();
        this.objectBloom?.forEach(target=>target.dispose());
        this.accumulateMaterial?.dispose();this.accumulateQuad?.dispose();
        this.depthEffects.dispose();
        if (this.bloomComposer) {
            this.bloomComposer.renderTarget1.dispose();
            this.bloomComposer.renderTarget2.dispose();
        }

        if (this.finalComposer) {
            this.finalComposer.renderTarget1.dispose();
            this.finalComposer.renderTarget2.dispose();
        }

        if (this.bloomPass) {
            this.bloomPass.dispose();
        }

        if (this.outlinePass) {
            this.outlinePass.dispose();
        }

        if (this.mixPass && this.mixPass.material) {
            this.mixPass.material.dispose();
        }
    }
}
