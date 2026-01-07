# Bucciafico Lib

bucciafico-lib is a framework-agnostic 3D rendering engine built on top of Three.js. It is designed
specifically for visualizing, posing, and manipulating Minecraft character skins and items.
The library features a custom rendering pipeline that includes voxelized outer layers for skins, shader-based glow
effects, post-processing (bloom, outline), and a robust undo/redo history system for editor implementations.

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

The library is framework-agnostic and can be initialized with a standard HTML DOM element.

```javascript
import {SkinViewer} from 'bucciafico-lib';

// 1. Select the container element
const container = document.getElementById('viewer-container');

// 2. Initialize the viewer with configuration
const viewer = new SkinViewer(container, {
    isEditor: false,        // Disable gizmos and interaction tools
    showGrid: true,         // Render floor grid
    transparent: true,      // Transparent background
    cameraEnabled: true     // Allow OrbitControls
});

// 3. Load a skin
viewer.loadSkinByUsername('HappyGFX').then(() => {
    console.log('Skin loaded successfully');
});

// 4. Handle window resizing (required for vanilla JS)
window.addEventListener('resize', () => {
    viewer.onResize();
});
```

### Configuration Options

The `SkinViewer` constructor accepts a configuration object:

| Option          | Type    | Default    | Description                                                   |
|-----------------|---------|------------|---------------------------------------------------------------|
| `isEditor`      | boolean | `true`     | Enables transformation gizmos, raycasting, and history stack. |
| `showGrid`      | boolean | `true`     | Toggles the visibility of the ground grid helper.             |
| `transparent`   | boolean | `false`    | If true, the canvas background is transparent (alpha 0).      |
| `bgColor`       | number  | `0x141417` | Hex color of the background if transparency is disabled.      |
| `cameraEnabled` | boolean | `true`     | Enables or disables mouse interaction with the camera.        |

## API Reference

### Skin Loading
```javascript
// Load from URL or Data URI
// Returns a Promise resolving to boolean: true if model is Slim, false if Classic
viewer.loadSkin('path/to/skin.png').then(isSlim => ...);

// Load from Minecraft Username (via Minotar API)
viewer.loadSkinByUsername('Notch');
```

### Posing
```javascript
const runPose = {
    leftArm: { rot: [-0.9, 0, 0] },
    rightArm: { rot: [0.9, 0, 0] },
    leftLeg:  { rot: [0.5, 0, 0] },
    rightLeg: { rot: [-0.5, 0, 0] },
    head:     { rot: [0.2, 0, 0] }
};

// Apply pose
viewer.setPose(runPose);

// Get current pose
const currentPose = viewer.getPose();
```

### Item Management
```javascript
// Add an item from a texture URL
viewer.addItem('path/to/sword.png', 'Diamond Sword').then(mesh => {
    // mesh is a THREE.Mesh object
});

// Remove an item
viewer.removeItem(meshObject);
```

### Visual Effects (Glow)
```javascript
viewer.updateEffects({
    backlight: {
        enabled: true,
        height: 0.5,    // 0.0 to 1.0 (Gradient height)
        thickness: 4,   // Border thickness
        strength: 1.5,  // Bloom intensity
        radius: 0.4     // Bloom radius
    }
});
```

### Editor Controls
```javascript
// Toggle editor mode dynamically
viewer.setEditorMode(true);

// Set Gizmo mode
viewer.setTransformMode('rotate'); // 'translate', 'rotate', 'scale'

// Undo / Redo
viewer.undo();
viewer.redo();
```

### Export
```javascript
// Render a transparent PNG
// Width and Height are optional; defaults to current canvas size if omitted.
const dataUrl = viewer.captureScreenshot(1920, 1080);
```

## License
MIT License