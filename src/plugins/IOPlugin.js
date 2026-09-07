import {poolProjectAssets,unpackProjectAssets} from '../utils/ProjectAssets.js';
import {validateProject,PROJECT_VERSION,DEFAULT_RENDER_SETTINGS} from '../utils/ProjectDocument.js';
const embeddedImages=new WeakMap();
function embeddedImage(texture){
    const image=texture?.image;if(!image)return null;
    if(embeddedImages.has(image))return embeddedImages.get(image);
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
    canvas.getContext('2d').drawImage(image,0,0);const value=canvas.toDataURL('image/png');embeddedImages.set(image,value);return value;
}
/**
 * Plugin responsible for Import/Export of the entire scene state.
 * It gathers data from Core and all other Plugins to create a comprehensive JSON snapshot.
 */
export class IOPlugin {
    constructor() {
        this.name = 'IOPlugin';
    }

    init(viewer) {
        this.viewer = viewer;
        this.queue = Promise.resolve();
    }

    /**
     * Exports the scene state based on provided options.
     * @param {Object} options - Filters for export.
     * @param {boolean} options.skin - Include skin source (username/url).
     * @param {boolean} options.camera - Include camera position/target.
     * @param {boolean} options.effects - Include effects config.
     * @param {boolean} options.pose - Include character pose.
     * @param {boolean} options.items - Include items.
     */
    exportState(options = {skin: true, camera: true, effects: true, pose: true, items: true, env: true}) {
        const state = {
            meta: {
                generator: "Bucciafico Studio",
                version: PROJECT_VERSION,
                timestamp: Date.now()
            },
            core: {}
        };

        const isZero = (arr) => arr[0] === 0 && arr[1] === 0 && arr[2] === 0;
        const isOne = (arr) => arr[0] === 1 && arr[1] === 1 && arr[2] === 1;
        const f = (n) => parseFloat(n.toFixed(3));

        if (options.skin) {
            state.core.skin = this.viewer.skinData || null;
            state.core.cape = this.viewer.capeData || null;
        }

        // 2. Camera & Config
        if (options.camera) {
            state.core.camera = this.viewer.cameraManager.getSettingsJSON();
            state.core.config = {
                bgColor: this.viewer.config.bgColor,
                transparent: this.viewer.config.transparent,
                showGrid: this.viewer.config.showGrid
            };
        }

        // 3. Environment
        if (options.env) {
            state.environment = this.viewer.sceneSetup.getLightConfig();
        }

        // 4. Pose
        if (options.pose) {
            state.pose = this.viewer.skinModel.getPose();
        }

        // 5. Effects
        if (options.effects) {
            const effectsPlugin = this.viewer.getPlugin('EffectsPlugin');
            if (effectsPlugin) {
                state.effects = {
                    backlight: effectsPlugin.getConfig()
                };
            }
        }

        // 6. Items
        if (options.items) {
            const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
            if (itemsPlugin && itemsPlugin.items.length > 0) {
                state.items = itemsPlugin.items.map(item => {
                    const pos = item.position.toArray().map(f);
                    const rot = item.rotation.toArray().slice(0, 3).map(f);
                    const scale = item.scale.toArray().map(f);

                    const transform = {};
                    if (!isZero(pos)) transform.pos = pos;
                    if (!isZero(rot)) transform.rot = rot;
                    if (!isOne(scale)) transform.scale = scale;

                    return {
                        name: item.name,
                        uuid: item.uuid,
                        equipment: itemsPlugin.equipmentData(item),
                        sourceUrl: item.userData.sourceUrl && !item.userData.sourceUrl.startsWith('data:') ? embeddedImage(item.material?.map) : item.userData.sourceUrl || null,
                        resource: item.userData.resourceSpec || undefined,
                        importedModel: item.userData.importedModel,
                        resourceScope: item.userData.resourceScope,
                        sceneParentId: item.parent?.userData.sceneGroup ? item.parent.uuid : null,
                        visible: item.visible,
                        locked: !!item.userData.editLocked,
                        missingSource: item.userData.missingSource,
                        parentId: item.userData.parentId || null,
                        characterId: item.userData.characterId || null,
                        transform: Object.keys(transform).length > 0 ? transform : undefined
                    };
                });
            }
        }

        const resourceManager = this.viewer.getPlugin('ItemsPlugin')?.resources;
        if (options.items && resourceManager) state.resources = resourceManager.serialize();
        state.poseLibrary = this.viewer.projectPoseLibrary?.length ? this.viewer.projectPoseLibrary : this.viewer.getPlugin('PosePlugin')?.library || [];
        state.poseSettings = this.viewer.getPlugin('PosePlugin')?.settings;
        state.activeCharacterId = this.viewer.activeCharacter?.id || null;
        state.documentName=this.viewer.projectName||'Untitled';
        state.cameras=structuredClone(this.viewer.savedCameras||[]);
        state.variants=structuredClone(this.viewer.sceneVariants||[]);
        state.renderSettings={...DEFAULT_RENDER_SETTINGS,...this.viewer.renderSettings};
        state.groups = this.viewer.getPlugin('SceneToolsPlugin')?.serializeGroups() || [];
        state.sceneTools = this.viewer.getPlugin('SceneToolsPlugin')?.settings;
        if(options.items){
            const items=this.viewer.getPlugin('ItemsPlugin');
            const usedModels=new Set(items?.items.map(i=>i.userData.importedModel));
            state.importedModels=Object.fromEntries(Object.entries(items?.models?.serialize()||{}).filter(([id])=>usedModels.has(id)));
            const usedScopes=new Set(items?.items.map(i=>i.userData.resourceScope));
            state.resourceScopes=Object.fromEntries(Object.entries(items?.serializeScopes?.()||{}).filter(([id])=>usedScopes.has(id)));
        }
        state.characters = this.viewer.characters.map(c => {
            const result = this.viewer.exportCharacter(c);
            if(options.skin && result.cape?.value && !result.cape.value.startsWith('data:')){
                const mesh=c.model.parts.cape?.children.find(o=>o.isMesh&&!o.userData.isGlow);
                const value=embeddedImage(mesh?.material?.map);if(value)result.cape={type:'url',value};
            }
            result.sceneParentId=c.model.getGroup().parent?.userData.sceneGroup ? c.model.getGroup().parent.uuid : null;
            result.visible=c.model.getGroup().visible;
            result.locked=!!c.model.getGroup().userData.editLocked;
            result.missingSkin=c.missingSkin;result.missingCape=c.missingCape;
            if (!options.skin) {
                delete result.skin;
                delete result.cape;
            }
            if (!options.pose) delete result.pose;
            return result;
        });
        // Browsing the catalog must not add cache entries to the document.
        const prune=(bundle,scope)=>{
            if(!bundle)return bundle;
            const roots=this.viewer.getPlugin('ItemsPlugin')?.items.filter(i=>(i.userData.resourceScope||null)===(scope||null)&&i.userData.resourceSpec)||[];
            if(roots.some(i=>i.userData.resourceError))return bundle;
            const used=new Set();for(const root of roots)root.traverse(o=>{for(const path of o.userData.dependencies||[])used.add(path);});
            const vanilla=Object.fromEntries(Object.entries(bundle.vanilla||{}).filter(([path])=>used.has(path)));
            const resources={},known=new Map();
            const ref=id=>{const value=bundle.resources[id];if(!known.has(value)){const key='r'+known.size;known.set(value,key);resources[key]=value;}return known.get(value);};
            const map=files=>Object.fromEntries(Object.entries(files||{}).sort(([a],[b])=>a.localeCompare(b)).map(([path,id])=>[path,ref(id)]));
            const mapped=map(vanilla),packs=(bundle.packs||[]).map(p=>({...p,files:map(p.files)}));
            return {...bundle,revision:Object.keys(vanilla).length?bundle.revision:undefined,vanilla:mapped,packs,resources};
        };
        state.resources=prune(state.resources);
        if(state.resourceScopes)state.resourceScopes=Object.fromEntries(Object.entries(state.resourceScopes).map(([id,bundle])=>[id,prune(bundle,id)]));
        return poolProjectAssets(state);
    }

    /**
     * Imports a full state from a JSON object.
     * Reconstructs the scene step-by-step.
     * @param {Object|string} jsonData
     * @returns {Promise<void>}
     */
    importState(jsonData, options={}) {
        const task=this.queue.then(()=>this.restoreProject(jsonData,options));
        this.queue=task.catch(()=>{});return task;
    }
    validate(input){const result=validateProject(input);this.viewer.getPlugin('SceneToolsPlugin')?.validateHierarchy(result.data);return result;}
    async restoreProject(jsonData, {history=false,repairable=false,preserveHistory=false}={}) {
        const {data} = this.validate(jsonData);
        if (!data || typeof data !== 'object') throw new Error('Nieprawidłowy projekt.');
        if(repairable)for(const bundle of [data.resources,...Object.values(data.resourceScopes||{})].filter(Boolean)){
            bundle.resources={...bundle.resources};
            for(const [path,ref]of [...Object.entries(bundle.vanilla||{}),...(bundle.packs||[]).flatMap(p=>Object.entries(p.files||{}))])if(typeof bundle.resources[ref]!=='string')bundle.resources[ref]='missing-asset:'+path;
        }
        const records = structuredClone(data.characters || [{
            name: 'Character',
            skin: data.core?.skin,
            cape: data.core?.cape,
            pose: data.pose
        }]);
        if (!Array.isArray(records) || records.length > 20) throw new Error('Maximum 20 characters');
        this.viewer.getPlugin('SceneToolsPlugin')?.validateHierarchy(data);
        if (!data.meta?.version || Number(data.meta.version.split('.').slice(0, 2).join('.')) < 1.1) {
            for (const record of records) {
                if (record.pose?.body?.pos) record.pose.body.pos[1] -= 6;
                if (record.pose?.waist?.pos) record.pose.waist.pos[1] += 6;
            }
        }
        if (data.items && (!Array.isArray(data.items) || data.items.length + records.length > 2000)) throw new Error('Invalid equipment list');
        if (data.poseLibrary && (!Array.isArray(data.poseLibrary) || data.poseLibrary.some(p => !p || typeof p.name !== 'string' || !p.pose || typeof p.pose !== 'object'))) throw new Error('Invalid pose library');
        const original = [...this.viewer.characters], previous = this.viewer.activeCharacter?.id;
        const items = this.viewer.getPlugin('ItemsPlugin'), posing = this.viewer.getPlugin('PosePlugin'),
            editor = this.viewer.getPlugin('EditorPlugin');
        const originalItems = [...(items?.items || [])], cameraBefore = this.viewer.cameraManager.getSettingsJSON();
        const settingsBefore = posing ? structuredClone(posing.settings) : null;
        const staged = [], stagedItems = [], ids = new Map();
        const resourceBefore = items?.resources?.serialize(),scopesBefore=items?.serializeScopes(),modelsBefore=items?.models?.serialize();
        if (editor) editor.restoring = true;
        try {
            if(data.importedModels)items.models.restore(data.importedModels);
            if(data.resourceScopes)items.restoreScopes(data.resourceScopes);
            if (data.resources) items.enableResources().restore(data.resources);
            else if (items?.resources) items.resources.restore({
                version: '26.2',
                resources: {},
                vanilla: {},
                packs: []
            });
            if (posing && data.poseSettings) posing.configure(data.poseSettings);
            for (const record of records) {
                if (!record || !['auto', 'steve', 'alex'].includes(record.modelType || 'auto')) throw new Error('Nieprawidłowa postać w projekcie.');
                let c;
                try {if(record.skin?.value?.startsWith('missing-asset:'))throw Error('Missing skin: '+record.skin.value);c=await this.viewer.addCharacter({...record,id:undefined});}
                catch(error){if(!repairable)throw error;c=await this.viewer.addCharacter({...record,id:undefined,skin:null});c.missingSkin={source:record.skin,error:error.message};}
                c.missingSkin=record.missingSkin||c.missingSkin;c.missingCape=record.missingCape;
                staged.push(c);
                ids.set(record.id, c.id);
                c.lockScale = record.lockScale !== false;
                if (record.cape?.value) {
                    try {
                    if(record.cape.value.startsWith('missing-asset:'))throw Error('Missing cape: '+record.cape.value);
                    if (record.cape.type === 'username') {
                        if (!await this.viewer.loadCapeByUsername(record.cape.value)) throw new Error('Cape could not be loaded');
                    } else await this.viewer.loadCape(record.cape.value);
                    } catch(error){if(!repairable)throw error;c.missingCape={source:record.cape,error:error.message};}
                    if (record.pose?.cape) {
                        const part = c.model.parts.cape, t = record.pose.cape;
                        if (t.rot) part.rotation.fromArray(t.rot);
                        if (t.pos) part.position.fromArray(t.pos);
                        if (t.scl) part.scale.fromArray(t.scl);
                    }
                }
            }
            if (items) for (const item of data.items || []) {
                if(!item.sourceUrl&&!item.resource&&!item.importedModel&&item.equipment?.armorSlot)continue;
                if (!item.sourceUrl && !item.resource && !item.importedModel && !repairable && !item.missingSource) throw new Error('Object has no source: '+item.name);
                const owner = ids.get(item.characterId) || staged[0]?.id;
                if(item.parentId && !owner)throw new Error('Missing attachment character: '+item.characterId);
                let mesh;
                try {if(item.missingSource)throw Error(item.missingSource.error);mesh=item.importedModel ? await items.addImportedModel(item.importedModel,item.name) : item.resource ? await items.addAsset(item.resource,item.name,true,item.resourceScope) : item.sourceUrl ? await items.addItem(item.sourceUrl,item.name) : null;if(!mesh)throw Error('Object has no source: '+item.name);}
                catch(error){if(!repairable&&!item.missingSource)throw error;mesh=items.addMissingItem(item,error.message);}
                stagedItems.push(mesh);
                mesh.userData.importUuid=item.uuid;
                if(stagedItems.length%32===0)await new Promise(resolve=>setTimeout(resolve,0));
                mesh.visible=item.visible!==false;mesh.userData.editLocked=!!item.locked;
                if (item.parentId) items.attachItem(mesh, item.parentId, owner);
                mesh.position.fromArray(item.transform?.pos || [0, 0, 0]);
                mesh.rotation.fromArray(item.transform?.rot || [0, 0, 0]);
                mesh.scale.fromArray(item.transform?.scale || [1, 1, 1]);
                items.restoreEquipmentData(mesh, item.equipment);
            }
        } catch (error) {
            if (resourceBefore) items.resources.restore(resourceBefore);
            if(scopesBefore)items.restoreScopes(scopesBefore);if(modelsBefore)items.models.restore(modelsBefore);
            for (const item of stagedItems) if (items.items.includes(item)) items.removeItem(item);
            for (const c of staged) this.viewer.removeCharacter(c.id);
            if(previous)this.viewer.selectCharacter(previous);
            this.viewer.cameraManager.loadSettingsJSON(cameraBefore);
            if (posing) posing.configure(settingsBefore);
            if (editor) editor.restoring = false;
            throw error;
        }
        try {
            for (const c of original) this.viewer.removeCharacter(c.id);
            for (const item of originalItems) if (items.items.includes(item)) items.removeItem(item);
            for(let i=0;i<staged.length;i++){
                const c=staged[i], old=c.id, id=records[i].id||old;
                c.id=id;c.model.getGroup().userData.editLocked=!!records[i].locked;c.model.getGroup().userData.characterId=id;c.model.getGroup().visible=records[i].visible!==false;
                for(const item of stagedItems)if(item.userData.characterId===old)item.userData.characterId=id;
            }
            stagedItems.forEach(mesh=>{if(mesh.userData.importUuid)mesh.uuid=mesh.userData.importUuid;delete mesh.userData.importUuid;});
            this.viewer.getPlugin('SceneToolsPlugin')?.restoreGroups(data);
            if(staged.length)this.viewer.selectCharacter(data.activeCharacterId && this.viewer.getCharacter(data.activeCharacterId) ? data.activeCharacterId : staged[0].id);
            if (data.core?.config) this.viewer.updateConfig(data.core.config);
            if (data.core?.camera && !history) this.viewer.cameraManager.loadSettingsJSON(data.core.camera);
            this.viewer.projectName=data.documentName||data.meta?.name||'Untitled';
            if(history)this.viewer.cameraManager.loadSettingsJSON(cameraBefore);
            this.viewer.savedCameras=structuredClone(data.cameras||[]);
            this.viewer.sceneVariants=structuredClone(data.variants||[]);
            this.viewer.renderSettings={...DEFAULT_RENDER_SETTINGS,...data.renderSettings};
            if (data.environment) this.viewer.setEnvironment({shadows:false, shadowStrength:0.65, shadowSoftness:1, sunAzimuth:45, sunElevation:55, ...data.environment});
            if (data.effects?.backlight) {
                const {DEFAULT_AO,DEFAULT_DOF}=await import('../utils/PostEffectsConfig.js');
                this.viewer.getPlugin('EffectsPlugin')?.updateConfig({innerGlow:1, outerGlow:1, ...data.effects.backlight,
                    ao:{...DEFAULT_AO,...data.effects.backlight.ao},dof:{...DEFAULT_DOF,...data.effects.backlight.dof}});
            }
            if (posing) {
                if(!history)this.viewer.projectPoseLibrary=structuredClone(data.poseLibrary||[]);
                this.viewer.emit('pose:library');
            }
            editor?.deselect();
            if (editor && !history && !preserveHistory) {
                editor.history.clear?.();
                editor.history.undoStack = [];
                editor.history.redoStack = [];
            }
            this.viewer.emit('characters:change');
            this.viewer.emit('project:restored');
            this.viewer.requestRender();
        } finally {
            if (editor) editor.restoring = false;
        }
    }
}
