# Bucciafico Lib

bucciafico-lib is a framework-agnostic 3D rendering engine built on top of Three.js. It is designed
specifically for visualizing, posing, and manipulating Minecraft character skins and items.
The library features a custom rendering pipeline that includes voxelized outer layers for skins, shader-based glow
effects, post-processing (bloom, outline), and a robust undo/redo history system for editor implementations.

The library utilizes a plugin-based architecture, allowing developers to include only the necessary features (e.g., just the viewer core) or extend it with a full suite of editing tools, post-processing effects, and item management.
## Features

The repository is organized into the following workspaces:

- **Advanced Skin Rendering:** Automatically detects Classic (Steve) and Slim (Alex) models.
- **Voxelized Outer Layers:** The second layer of the skin (hat, jacket, sleeves) is generated as 3D voxels rather than
  flat planes, providing depth and realism.
- **Custom Shader Effects:** Includes a specialized shader for creating inner-body glow/backlight effects with
  configurable gradient, strength, and blur.
- **Item Extrusion:** Procedurally generates 3D meshes from 2D item textures.
- **Post-Processing Pipeline:** Integrated UnrealBloom and Outline passes for high-quality visuals and object selection
  highlighting.
- **Editor Tools:** Built-in support for Gizmo controls (Translate, Rotate, Scale), Raycasting, and History management (
  Undo/Redo).
- **High-Resolution Export:** Capable of rendering high-resolution, transparent PNG screenshots independent of the
  canvas viewport size.

## Installation

The library relies on `three` as a peer dependency.

```bash
npm install three
npm install bucciafico-lib
```

## Usage

### Basic Initialization
If you only need to display a character without interaction or advanced effects:

```javascript
import { SkinViewer } from 'bucciafico-lib';

const container = document.getElementById('viewer-container');

// Initialize Core
const viewer = new SkinViewer(container, {
    showGrid: true,
    transparent: true,
    cameraEnabled: true
});

// Load Skin
viewer.loadSkinByUsername('HappyGFX');
```

### Full Editor Setup
To enable Gizmos, Glow effects, and Item management, register the respective plugins.

```javascript
import { SkinViewer, EditorPlugin, EffectsPlugin, ItemsPlugin } from 'bucciafico-lib';

const viewer = new SkinViewer(document.getElementById('app'));

// Initialize Plugins
const editor = new EditorPlugin();
const effects = new EffectsPlugin();
const items = new ItemsPlugin();

// Register Plugins
viewer.addPlugin(editor);
viewer.addPlugin(effects);
viewer.addPlugin(items);

// Load Skin
viewer.loadSkinByUsername('Notch');
```

### Configuration Options

The `SkinViewer` constructor accepts a configuration object:

| Option          | Type    | Default    | Description                                                   |
|-----------------|---------|------------|---------------------------------------------------------------|
| `showGrid`      | boolean | `true`     | Toggles the visibility of the ground grid helper.             |
| `transparent`   | boolean | `false`    | If true, the canvas background is transparent (alpha 0).      |
| `bgColor`       | number  | `0x141417` | Hex color of the background if transparency is disabled.      |
| `cameraEnabled` | boolean | `true`     | Enables or disables mouse interaction with the camera.        |

## API Reference

### Skin Loading
```javascript
// Load skin from URL (returns Promise<boolean> isSlim)
viewer.loadSkin('path/to/skin.png');

// Load by Username
viewer.loadSkinByUsername('Notch');

// Set Pose (Rotation in radians)
viewer.setPose({
    head: { rot: [0.2, 0, 0] },
    leftArm: { rot: [-0.5, 0, 0] }
});

// Get Plugin Instance
const editor = viewer.getPlugin('EditorPlugin');
```

### Editor
```javascript
const editor = viewer.getPlugin('EditorPlugin');

// Change Gizmo Mode
editor.setTransformMode('rotate'); // 'translate', 'rotate', 'scale'

// Selection
editor.deselect(); // Clear selection

// History
editor.undo();
editor.redo();
```

### Effects
```javascript
const fx = viewer.getPlugin('EffectsPlugin');

// Configure Glow
fx.updateConfig({
    enabled: true,
    strength: 1.5, // Bloom intensity
    radius: 0.4,   // Bloom radius
    height: 0.5,   // Gradient height (0.0 - 1.0)
    thickness: 4   // Glow thickness
});

// Capture Screenshot (Transparent PNG)
const dataUrl = fx.captureScreenshot(1920, 1080);
```

### Items
```javascript
const items = viewer.getPlugin('ItemsPlugin');

// Add Item
items.addItem('path/to/sword.png', 'Diamond Sword').then(mesh => {
    console.log('Item added');
});

// Remove Item
items.removeItem(meshObject);
```

## License
MIT License