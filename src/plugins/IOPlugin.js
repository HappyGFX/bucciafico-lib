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
                    const rot = item.rotation.toArray().map(f);
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
                        transform: Object.keys(transform).length > 0 ? transform : undefined
                    };
                });
            }
        }

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

        // 1. Core Config (Background, Grid)
        if (data.core?.config) {
            const cfg = data.core.config;
            this.viewer.config.showGrid = cfg.showGrid;
            this.viewer.sceneSetup.setGridVisible(cfg.showGrid);
            if (!cfg.transparent && cfg.bgColor) {
                this.viewer.scene.background.setHex(cfg.bgColor);
            }
        }

        // 2. Camera
        if (data.core?.camera) {
            this.viewer.cameraManager.loadSettingsJSON(data.core.camera);
        }

        // 3. Environment
        if (data.environment) {
            this.viewer.setEnvironment(data.environment);
        }

        this.viewer.loadPlaceholderSkin();
        this.viewer.resetCape();

        if (data.pose) {
            this.viewer.setPose(data.pose);
        }

        const loadPromises = [];
        // 4. Skin/Cape (Async)
        if (data.core?.skin) {
            const skinInfo = data.core.skin;
            if (skinInfo.type === 'username') {
                loadPromises.push(this.viewer.loadSkinByUsername(skinInfo.value));
            } else if (skinInfo.value) {
                loadPromises.push(this.viewer.loadSkin(skinInfo.value));
            }
        }

        if (data.core?.cape) {
            const capeInfo = data.core.cape;
            if (capeInfo.type === 'username') {
                loadPromises.push(this.viewer.loadCapeByUsername(capeInfo.value));
            } else if (capeInfo.value) {
                loadPromises.push(this.viewer.loadCape(capeInfo.value));
            }
        } else {
            this.viewer.resetCape();
        }

        await Promise.allSettled(loadPromises);
        if (this.viewer.isDisposed) return;

        // 5. Effects
        if (data.effects?.backlight) {
            const fx = this.viewer.getPlugin('EffectsPlugin');
            if (fx) fx.updateConfig(data.effects.backlight);

        }

        // 6. Items (Async & Complex)
        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin) {
            [...itemsPlugin.items].forEach(item => itemsPlugin.removeItem(item));

            if (data.items && Array.isArray(data.items)) {
                const itemPromises = data.items.map(async (itemData) => {
                    if (!itemData.sourceUrl) return;

                    try {
                        const mesh = await itemsPlugin.addItem(itemData.sourceUrl, itemData.name);

                        if (itemData.parentId) {
                            itemsPlugin.attachItem(mesh, itemData.parentId);
                        }

                        if (itemData.transform) {
                            mesh.position.fromArray(itemData.transform.pos || [0, 0, 0]);
                            mesh.rotation.fromArray(itemData.transform.rot || [0, 0, 0]);
                            mesh.scale.fromArray(itemData.transform.scale || [1, 1, 1]);
                        } else {
                            mesh.position.set(0, 0, 0);
                            mesh.rotation.set(0, 0, 0);
                            mesh.scale.set(1, 1, 1);
                        }
                    } catch (e) {
                        console.warn(`Failed to import item ${itemData.name}:`, e);
                    }
                });
                await Promise.all(itemPromises);
            }
        }

        // 7. Pose
        if (data.pose) {
            this.viewer.setPose(data.pose);
        }
    }
}