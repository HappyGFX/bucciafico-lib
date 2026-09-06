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
    exportState(options = {skin: true, camera: true, effects: true, pose: true, items: true, env: true}) {
        const state = {
            meta: {
                generator: "Bucciafico Studio",
                version: "1.2.0",
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
                        sourceUrl: item.userData.sourceUrl || null,
                        resource: item.userData.resourceSpec || undefined,
                        parentId: item.userData.parentId || null,
                        characterId: item.userData.characterId || null,
                        transform: Object.keys(transform).length > 0 ? transform : undefined
                    };
                });
            }
        }

        const resourceManager = this.viewer.getPlugin('ItemsPlugin')?.resources;
        if (options.items && resourceManager) state.resources = resourceManager.serialize();
        state.poseLibrary = this.viewer.getPlugin('PosePlugin')?.library || [];
        state.poseSettings = this.viewer.getPlugin('PosePlugin')?.settings;
        state.activeCharacterId = this.viewer.activeCharacter.id;
        state.characters = this.viewer.characters.map(c => {
            const result = this.viewer.exportCharacter(c);
            if (!options.skin) {
                delete result.skin;
                delete result.cape;
            }
            if (!options.pose) delete result.pose;
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
        const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        if (!data || typeof data !== 'object') throw new Error('Nieprawidłowy projekt.');
        const records = structuredClone(data.characters || [{
            name: 'Character',
            skin: data.core?.skin,
            cape: data.core?.cape,
            pose: data.pose
        }]);
        if (!Array.isArray(records) || !records.length || records.length > 20) throw new Error('Projekt musi zawierać od 1 do 20 postaci.');
        if (!data.meta?.version || Number(data.meta.version.split('.').slice(0, 2).join('.')) < 1.1) {
            for (const record of records) {
                if (record.pose?.body?.pos) record.pose.body.pos[1] -= 6;
                if (record.pose?.waist?.pos) record.pose.waist.pos[1] += 6;
            }
        }
        if (data.items && (!Array.isArray(data.items) || data.items.length > 500)) throw new Error('Invalid equipment list');
        if (data.poseLibrary && (!Array.isArray(data.poseLibrary) || data.poseLibrary.some(p => !p || typeof p.name !== 'string' || !p.pose || typeof p.pose !== 'object'))) throw new Error('Invalid pose library');
        const original = [...this.viewer.characters], previous = this.viewer.activeCharacter.id;
        const items = this.viewer.getPlugin('ItemsPlugin'), posing = this.viewer.getPlugin('PosePlugin'),
            editor = this.viewer.getPlugin('EditorPlugin');
        const originalItems = [...(items?.items || [])], cameraBefore = this.viewer.cameraManager.getSettingsJSON();
        const settingsBefore = posing ? structuredClone(posing.settings) : null;
        const staged = [], stagedItems = [], ids = new Map();
        const resourceBefore = items?.resources?.serialize();
        if (editor) editor.restoring = true;
        try {
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
                const c = await this.viewer.addCharacter({...record, id: undefined});
                staged.push(c);
                ids.set(record.id, c.id);
                c.lockScale = record.lockScale !== false;
                if (record.cape?.value) {
                    if (record.cape.type === 'username') {
                        if (!await this.viewer.loadCapeByUsername(record.cape.value)) throw new Error('Cape could not be loaded');
                    } else await this.viewer.loadCape(record.cape.value);
                    if (record.pose?.cape) {
                        const part = c.model.parts.cape, t = record.pose.cape;
                        if (t.rot) part.rotation.fromArray(t.rot);
                        if (t.pos) part.position.fromArray(t.pos);
                        if (t.scl) part.scale.fromArray(t.scl);
                    }
                }
            }
            if (items) for (const item of data.items || []) {
                if (!item.sourceUrl && !item.resource) continue;
                const owner = ids.get(item.characterId) || staged[0].id;
                const mesh = item.resource ? await items.addAsset(item.resource, item.name, true) : await items.addItem(item.sourceUrl, item.name);
                stagedItems.push(mesh);
                if (item.parentId) items.attachItem(mesh, item.parentId, owner);
                mesh.position.fromArray(item.transform?.pos || [0, 0, 0]);
                mesh.rotation.fromArray(item.transform?.rot || [0, 0, 0]);
                mesh.scale.fromArray(item.transform?.scale || [1, 1, 1]);
                items.restoreEquipmentData(mesh, item.equipment);
            }
        } catch (error) {
            if (resourceBefore) items.resources.restore(resourceBefore);
            for (const item of stagedItems) if (items.items.includes(item)) items.removeItem(item);
            for (const c of staged) this.viewer.removeCharacter(c.id);
            this.viewer.selectCharacter(previous);
            this.viewer.cameraManager.loadSettingsJSON(cameraBefore);
            if (posing) posing.configure(settingsBefore);
            if (editor) editor.restoring = false;
            throw error;
        }
        try {
            for (const c of original) this.viewer.removeCharacter(c.id);
            for (const item of originalItems) if (items.items.includes(item)) items.removeItem(item);
            this.viewer.selectCharacter(ids.get(data.activeCharacterId) || staged[0].id);
            if (data.core?.config) this.viewer.updateConfig(data.core.config);
            if (data.core?.camera) this.viewer.cameraManager.loadSettingsJSON(data.core.camera);
            if (data.environment) this.viewer.setEnvironment(data.environment);
            if (data.effects?.backlight) this.viewer.getPlugin('EffectsPlugin')?.updateConfig(data.effects.backlight);
            if (posing) {
                if (Array.isArray(data.poseLibrary)) posing.library = data.poseLibrary.slice(0, 100);
                this.viewer.emit('pose:library');
            }
            editor?.deselect();
            if (editor) {
                editor.history.undoStack = [];
                editor.history.redoStack = [];
            }
            this.viewer.emit('characters:change');
            this.viewer.requestRender();
        } finally {
            if (editor) editor.restoring = false;
        }
    }
}
