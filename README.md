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
const io = new IOPlugin();

// Register Plugins
viewer.addPlugin(editor);
viewer.addPlugin(effects);
viewer.addPlugin(items);
viewer.addPlugin(io);

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

### IOPlugin
```javascript
const io = viewer.getPlugin('IOPlugin');

// Export State
// You can filter what to export using options
const jsonState = io.exportState({
    skin: true,
    camera: true,
    effects: true,
    pose: true,
    items: true
});

// Import State (Async)
io.importState(jsonState).then(() => {
    console.log('Scene restored');
});
```


## License
MIT License

## Bone posing

The viewer exposes `getBones()` (names), `getBone(name)` (Three.js Bone),
`setBoneRotation(name, [x, y, z])`, and `getPose()`. Angles use radians,
local XYZ Euler rotations. Setters request a frame and participate in editor history.

```js
viewer.setBoneRotation('rightElbow', [-Math.PI / 2, 0, 0]);
viewer.setBoneRotation('leftKnee', [Math.PI / 3, 0, 0]);
viewer.setBoneRotation('waist', [0, Math.PI / 6, 0]);
const pose = viewer.getPose();
viewer.setPose(pose);
viewer.getPlugin('EditorPlugin').selectBone('rightElbow');
```

Available bones: head, body, rightArm, leftArm, rightLeg, leftLeg,
rightElbow, leftElbow, rightKnee, leftKnee, waist.
Elbows and knees deform the lower half of their limb, including voxel and glow layers.
The waist joint sits at the centre of the torso (local y = -6). Rotation is distributed
smoothly over the full torso height, from fixed hips to the full rotation at the shoulders.
Quaternion interpolation preserves the width of each cross-section; the head, arms and
cape follow the shoulders. Body rotation
still moves the whole torso. Existing part names and head/limb rest positions are retained.

In Studio, select an arm, leg or the body. The large outer gizmo transforms the whole
part; the smaller inner rotation rings control its elbow, knee or centre torso joint.
Both sets share the same display centre, while the anatomical joint pivot stays intact.
Outer axes use RGB; inner axes use orange (X), cyan (Y), and violet (Z).
Both are available together, including while Move or Scale is selected. Dragging the
inner rings selects the joint in the numeric panel (degrees), without changing tools.
You can also select joints directly in Hierarchy.
Pose export/import, skin reload and undo/redo include joint transforms.
`setPose({})` resets all joints; `setPose` replaces the pose, while
`setBoneRotation` changes only one bone. Direct Bone mutations require
`viewer.requestRender()` when rendering is paused.


## Skin import and characters

`viewer.loadSkin(fileOrUrl)` accepts a PNG Blob/File, data URL or URL. Import checks the
PNG signature, decoded image and exact dimensions (64×64 or legacy 64×32), with a 2 MB
limit and a 15-second fetch timeout. Legacy limbs are mirrored face by face into a 64×64
atlas. Failed or superseded loads do not replace the current skin. Base and outer layers
preserve alpha; outer layers extrude individual visible pixels with correctly oriented face UVs.
Internal walls between adjacent opaque pixels are removed. Alex arms are 3 px wide with shoulder centres at ±5.5.

```js
await viewer.loadSkin(file);
viewer.setModelType('alex'); // auto | steve | alex; manual choice survives skin replacement
viewer.setCharacterVisibility({outer: true, parts: {head: false}, outerParts: {leftArm: false}});
await viewer.loadSkinByUsername('HappyGFX'); // also accepts plain or dashed UUID
const next = await viewer.addCharacter({name: 'Second character'});
await viewer.duplicateCharacter(next.id);
viewer.selectCharacter(next.id);
viewer.renameCharacter(next.id, 'Alex');
viewer.activeCharacter.lockScale = true;
viewer.getPlugin('ItemsPlugin').attachItem(item, 'rightElbow', next.id);
const project = viewer.getPlugin('IOPlugin').exportState();
await viewer.getPlugin('IOPlugin').importState(project);
```

`skinModel`, pose methods and skin/cape fields address the active character. Each entry
in `viewer.characters` has its own model, texture, pose, visibility, model type and scale
lock. Selecting a mesh switches its owner to active. Cosmetics keep their local transform
and attachment through skin/model changes. Project JSON includes all characters and item
owner IDs; legacy single-character JSON is still accepted.

Studio supports file input and dropping one skin anywhere, per-part base/outer visibility,
character names, duplication, adding/removing characters, and uniform scale via gizmo or
numeric inputs. Its local browser library stores the 12 most recent skins with head
thumbnails and up to 20 named presets (skin, model type, layer visibility). Presets keep
the current pose. These libraries are stored on this browser/device, not on an account.

Network skins use [Minotar's documented username/UUID endpoint](https://minotar.net/).
Auto model inference uses both unused arm strips; ambiguous textures can be overridden
manually. Modern partial transparency is retained rather than forced opaque.

Validation: run `npm --prefix apps/api test` from the monorepo root. The self-contained
browser integration test is `node apps/api/test/browser-skins.mjs`; set
`PUPPETEER_EXECUTABLE_PATH` to an installed Chrome if necessary. The Studio UI test is
`node apps/api/test/browser-skins-ui.mjs` with Studio running on port 3031 (or set
`STUDIO_URL`). Browser tests use generated fixture skins and can save screenshots in
`QA_OUTPUT_DIR`.


### Static pose library and equipment

Register `PosePlugin` alongside `EditorPlugin`, `ItemsPlugin` and `IOPlugin`.
Studio includes Neutral, Walk, Run, Sit, Hold item, Two hands and Wave in a
searchable full-screen library dialog with categories and previews. One hundred additional
poses cover Movement, Combat, Gestures, Adventure, Fun, Sports, Everyday, Reactions,
Work and Performance (107 built-in poses total). Selecting a
card previews it; Apply pose confirms the selection. Custom poses are saved in
the same dialog. The sidebar retains copy/paste, mirror, snapping and IK controls.
Named custom poses are stored
locally and included in exported projects.

`PosePlugin.apply()` edits body parts while preserving the character's scene transform
and cape. Pose-library translations are offsets from the default rig, so poses can
be copied between Steve and Alex. The torso's rigid pivot is now at its centre;
the waist joint retains the distributed twist deformation. Project format 1.1.0
migrates the torso and waist positions from earlier exports.

```js
import {PosePlugin, POSE_PRESETS} from 'bucciafico-lib';
const posing = viewer.addPlugin(new PosePlugin());
posing.apply(POSE_PRESETS.find(p => p.id === 'run').pose);
posing.reset('rightElbow'); // omit the name to reset the body pose and foot pins
posing.copy();              // select another character, then call paste()
posing.mirror();            // reflected pose; swap() only exchanges sides
posing.configure({symmetry: true, step: 1, locks: {x: false, y: false, z: true}});
posing.startIK('leftHand'); // leftHand, rightHand, leftFoot, rightFoot
posing.clearIK();
posing.pinFoot('leftFoot', true);

const items = viewer.getPlugin('ItemsPlugin');
const sword = await items.addItem(pngDataUrl, 'Sword');
items.gripItem(sword, 'rightHand', 'sword');
items.twoHandGrip(sword);
items.setItemAppearance(sword, {visible: true, tint: '#ffffff'});
```

Grip categories are generic, sword, tool, block, shield and bow. Hand sockets follow
the forearm joint; local item position, rotation and scale provide grip corrections.
The PNG's pixel density is retained when applying a grip. Two-hand grip moves the
primary hand into a shared holding position and solves the support arm.

Cape transforms are edited from the hierarchy and persisted alongside pose,
equipment, appearances, hand offsets, foot pins, helper settings and custom libraries.
Item loading failures during project import retain the previous scene.

IK uses an iterative two-joint solver. Movement limits are optional; unreachable
targets approach the reachable boundary. Foot pins hold a world-space target at
the scene ground height within the limb's reach. Animation and keyframes are not
part of this static posing editor.

Keyboard controls outside form fields: R/G/S rotate/move/scale, X/Y/Z toggle axis
locks, arrows rotate, Shift+arrows use one tenth of the selected rotation step,
0 resets the selected part, Shift+0 resets the pose, Ctrl/Cmd+Shift+C/V copies/pastes
a pose, Escape finishes IK. Existing Ctrl/Cmd+Z and redo shortcuts remain available.

Validation:
`npm --prefix apps/api test`,
`node apps/api/test/browser-posing.mjs` and
`node apps/api/test/browser-posing-ui.mjs` (Studio at localhost:3031).

### Client-side resource library

Studio includes a versioned Minecraft Java 26.2 block/item library, local ZIP/folder resource packs, static resource properties and portable project resources. See [resource library documentation](docs/resources.md) for interfaces, supported formats and validation commands.
