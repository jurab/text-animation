# lib/

Shared code for poems experiments.

## svg-renderer.js

OpenType.js-based SVG text renderer. Parses SVG text elements and renders them with accurate kerning, letter-spacing, and transform handling. Fixes various XD export bugs.

### Basic Usage

```javascript
import { SvgTextRenderer } from './lib/svg-renderer.js';

const renderer = new SvgTextRenderer();
await renderer.loadFonts({
  regular: '/fonts/ADolphin-Roman.otf',
  italic: '/fonts/ADolphin-Italic.otf'
});

// Full render pipeline
const canvas = renderer.render(svgText, { width: 1080, height: 1080 });

// Or step by step
const blocks = renderer.parse(svgText);
renderer.layout(blocks);
renderer.renderToContext(ctx, blocks);
```

### API

#### Constructor

```javascript
new SvgTextRenderer(options?)
```

- `options.calibration` - Initial calibration settings

#### Methods

| Method | Description |
|--------|-------------|
| `loadFonts(paths)` | Load font files. Returns promise. |
| `setCalibration(cal)` | Update calibration settings. |
| `parse(svgText, opts?)` | Parse SVG into TextBlock array. |
| `layout(blocks)` | Calculate letter positions. |
| `renderToContext(ctx, blocks, opts?)` | Render to canvas context. |
| `render(svgText, opts?)` | Full pipeline, returns canvas. |
| `renderTo(canvas, svgText, opts?)` | Render to existing canvas. |

#### Font Paths

```javascript
await renderer.loadFonts({
  regular: '/path/to/regular.ttf',
  italic: '/path/to/italic.ttf',
  txtRegular: '/path/to/txt-regular.otf',  // ADolphin
  txtItalic: '/path/to/txt-italic.otf',
  fleurons: '/path/to/fleurons.otf'
});
```

#### Calibration Options

```javascript
renderer.setCalibration({
  kernScale: 1.0,      // Kerning multiplier
  lsScale: 1.0,        // Letter-spacing multiplier
  lsOffset: 0,         // Letter-spacing offset (em)
  baselineOffset: 0,   // Vertical offset (px)
  xOffset: 0,          // Horizontal offset (px)
  spaceScale: 1.0,     // Space width multiplier
  spaceLs: true,       // Apply letter-spacing to spaces
  noMirrorKern: false, // Disable kerning for mirrored text
  noMirrorLs: false    // Disable letter-spacing for mirrored text
});
```

#### Render Options

```javascript
renderer.renderToContext(ctx, blocks, {
  showBoxes: false,    // Show letter bounding boxes
  showItalic: true,    // Render italic text
  blockOffsets: []     // Per-block {x, y} offsets
});
```

### XD Bug Fixes

The renderer handles several Adobe XD export bugs:
- Parent group transform accumulation (nested `<g>` elements)
- Child transforms in rotated parent space
- Complex matrix transforms (rotation + mirror)
- Right-aligned text with negative x offsets
- Letter-spacing inheritance (only italic inherits from parent)

### Advanced Usage

Export individual functions for custom pipelines:

```javascript
import { 
  parseSvgText, 
  layoutBlock, 
  renderBlock,
  TextBlock, 
  Line, 
  Word, 
  Letter 
} from './lib/svg-renderer.js';
```

## compiler.js

DOM-based text compilation - measures character positions using the Range API, then builds absolutely-positioned character elements that can be animated individually.

### Basic Usage

```javascript
import { compileLine } from './lib/compiler.js';

// HTML structure expected:
// <div class="line">
//   <span class="original">Hello world</span>
// </div>

const line = document.querySelector('.line');
const { compiled, charElements } = compileLine(line);

// Now each character is a separate <span class="char"> with exact positioning
```

### API

| Function | Description |
|----------|-------------|
| `compileText(lineElement)` | Measure char positions, return `{ text, chars[], lineRect }` |
| `buildCharElements(lineElement, compiled)` | Create positioned `<span class="char">` elements |
| `compileLine(lineElement)` | Convenience wrapper - compile + build in one call |

### Character Data

Each char in `compiled.chars[]`:
```javascript
{
  char: 'H',       // the character
  x: 0,            // x offset from line start
  y: 0,            // y offset from line start  
  width: 12,       // character width
  height: 24       // character height
}
```
