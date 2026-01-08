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
    exportState(options = { skin: true, camera: true, effects: true, pose: true, items: true }) {
        const state = {
            meta: {
                generator: "Bucciafico Studio",
                version: "1.0.3-BETA",
                timestamp: Date.now()
            },
            core: {}
        };

        if (options.skin) {
            state.core.skin = this.viewer.skinData || null;
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

        // 3. Pose
        if (options.pose) {
            state.pose = this.viewer.skinModel.getPose();
        }

        // 4. Effects
        if (options.effects) {
            const effectsPlugin = this.viewer.getPlugin('EffectsPlugin');
            if (effectsPlugin) {
                state.effects = {
                    backlight: effectsPlugin.getConfig()
                };
            }
        }

        // 5. Items
        if (options.items) {
            const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
            if (itemsPlugin && itemsPlugin.items.length > 0) {
                state.items = itemsPlugin.items.map(item => ({
                    name: item.name,
                    uuid: item.uuid,
                    sourceUrl: item.userData.sourceUrl || null,
                    transform: {
                        pos: item.position.toArray(),
                        rot: item.rotation.toArray(),
                        scale: item.scale.toArray()
                    }
                }));
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

        // 3. Skin (Async)
        if (data.core?.skin) {
            const skinInfo = data.core.skin;
            try {
                if (skinInfo.type === 'username') {
                    await this.viewer.loadSkinByUsername(skinInfo.value);
                } else if (skinInfo.value) {
                    await this.viewer.loadSkin(skinInfo.value);
                }
            } catch (e) {
                console.warn("Failed to load skin from import:", e);
            }
        }

        // 4. Effects
        if (data.effects?.backlight) {
            const fx = this.viewer.getPlugin('EffectsPlugin');
            if (fx) fx.updateConfig(data.effects.backlight);
        }

        // 5. Items (Async & Complex)
        const itemsPlugin = this.viewer.getPlugin('ItemsPlugin');
        if (itemsPlugin) {
            [...itemsPlugin.items].forEach(item => itemsPlugin.removeItem(item));

            if (data.items && Array.isArray(data.items)) {
                const promises = data.items.map(async (itemData) => {
                    if (!itemData.sourceUrl) return;

                    try {
                        const mesh = await itemsPlugin.addItem(itemData.sourceUrl, itemData.name);
                        // Apply Transform
                        if (itemData.transform) {
                            mesh.position.fromArray(itemData.transform.pos);
                            mesh.rotation.fromArray(itemData.transform.rot);
                            mesh.scale.fromArray(itemData.transform.scale);
                        }
                    } catch (e) {
                        console.warn(`Failed to import item ${itemData.name}:`, e);
                    }
                });
                await Promise.all(promises);
            }
        }

        // 6. Pose
        if (data.pose) {
            this.viewer.setPose(data.pose);
        }
    }
}