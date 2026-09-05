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
    exportState(options = { skin: true, camera: true, effects: true, pose: true, items: true, env: true }) {
        const state = {
            meta: {
                generator: "Bucciafico Studio",
                version: "1.0.9",
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
                    const rot = item.rotation.toArray().slice(0,3).map(f);
                    const scale = item.scale.toArray().map(f);

                    const transform = {};
                    if (!isZero(pos)) transform.pos = pos;
                    if (!isZero(rot)) transform.rot = rot;
                    if (!isOne(scale)) transform.scale = scale;

                    return {
                        name: item.name,
                        uuid: item.uuid,
                        sourceUrl: item.userData.sourceUrl || null,
                        parentId: item.userData.parentId || null,
                        characterId: item.userData.characterId || null,
                        transform: Object.keys(transform).length > 0 ? transform : undefined
                    };
                });
            }
        }

        state.activeCharacterId=this.viewer.activeCharacter.id;
        state.characters=this.viewer.characters.map(c=>{
            const result=this.viewer.exportCharacter(c);
            if(!options.skin){delete result.skin;delete result.cape;}
            if(!options.pose)delete result.pose;
            return result;
        });
        return state;
    }

    /**
     * Imports a full state from a JSON object.
     * Reconstructs the scene step-by-step.
     * @param {Object|string} jsonData
     * @returns {Promise<void>}
     */
    async importState(jsonData) {
        const data=typeof jsonData==='string'?JSON.parse(jsonData):jsonData;
        if(!data||typeof data!=='object')throw new Error('Nieprawidłowy projekt.');
        const records=data.characters||[{name:'Character',skin:data.core?.skin,cape:data.core?.cape,pose:data.pose}];
        if(!Array.isArray(records)||!records.length||records.length>20)throw new Error('Projekt musi zawierać od 1 do 20 postaci.');
        const original=[...this.viewer.characters],previous=this.viewer.activeCharacter.id;
        const cameraBefore=this.viewer.cameraManager.getSettingsJSON();
        const staged=[],ids=new Map();
        try {
            for(const record of records){
                if(!record||!['auto','steve','alex'].includes(record.modelType||'auto'))throw new Error('Nieprawidłowa postać w projekcie.');
                const c=await this.viewer.addCharacter({...record,id:undefined});staged.push(c);ids.set(record.id,c.id);
                c.lockScale=record.lockScale!==false;
                if(record.cape?.value){if(record.cape.type==='username')await this.viewer.loadCapeByUsername(record.cape.value);else await this.viewer.loadCape(record.cape.value);}
            }
        } catch(error){for(const c of staged)this.viewer.removeCharacter(c.id);this.viewer.selectCharacter(previous);this.viewer.cameraManager.loadSettingsJSON(cameraBefore);throw error;}
        for(const c of original)this.viewer.removeCharacter(c.id);
        this.viewer.selectCharacter(ids.get(data.activeCharacterId)||staged[0].id);
        if(data.core?.config)this.viewer.updateConfig(data.core.config);
        if(data.core?.camera)this.viewer.cameraManager.loadSettingsJSON(data.core.camera);
        if(data.environment)this.viewer.setEnvironment(data.environment);
        if(data.effects?.backlight)this.viewer.getPlugin('EffectsPlugin')?.updateConfig(data.effects.backlight);
        const items=this.viewer.getPlugin('ItemsPlugin');
        if(items){
            [...items.items].forEach(item=>items.removeItem(item));
            for(const item of data.items||[]){
                if(!item.sourceUrl)continue;
                const mesh=await items.addItem(item.sourceUrl,item.name);
                if(item.parentId)items.attachItem(mesh,item.parentId,ids.get(item.characterId)||staged[0].id);
                mesh.position.fromArray(item.transform?.pos||[0,0,0]);
                mesh.rotation.fromArray(item.transform?.rot||[0,0,0]);
                mesh.scale.fromArray(item.transform?.scale||[1,1,1]);
            }
        }
        this.viewer.getPlugin('EditorPlugin')?.deselect();
        this.viewer.emit('characters:change');this.viewer.requestRender();
    }
}
