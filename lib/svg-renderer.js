/**
 * SVG Text Renderer - OpenType.js based text rendering from SVG
 * 
 * Parses SVG text elements and renders them using OpenType.js for accurate
 * kerning, letter-spacing, and transform handling. Fixes various XD export bugs.
 * 
 * Usage:
 *   import { SvgTextRenderer } from './lib/svg-renderer.js';
 *   
 *   const renderer = new SvgTextRenderer();
 *   await renderer.loadFonts({
 *     regular: '/fonts/ADolphin-Roman.otf',
 *     italic: '/fonts/ADolphin-Italic.otf'
 *   });
 *   
 *   const canvas = renderer.render(svgText, { width: 1080, height: 1080 });
 */

import opentype from 'https://esm.sh/opentype.js@1.3.4';

// ============ OOP STRUCTURES ============

class Letter {
  constructor(char, font, fontSize) {
    this.char = char;
    this.font = font;
    this.fontSize = fontSize;
    
    const glyph = font.charToGlyph(char);
    const scale = fontSize / font.unitsPerEm;
    
    this.glyph = glyph;
    this.glyphIndex = glyph.index;
    this.advanceWidth = glyph.advanceWidth * scale;
    
    const bbox = glyph.getBoundingBox();
    this.bbox = {
      x1: bbox.x1 * scale,
      y1: bbox.y1 * scale,
      x2: bbox.x2 * scale,
      y2: bbox.y2 * scale,
      width: (bbox.x2 - bbox.x1) * scale,
      height: (bbox.y2 - bbox.y1) * scale
    };
    
    this.x = 0;
    this.y = 0;
  }
  
  kernTo(nextLetter, scale = 1) {
    if (!nextLetter || !this.font.kerningPairs) return 0;
    const kern = this.font.getKerningValue(this.glyph, nextLetter.glyph);
    return kern * (this.fontSize / this.font.unitsPerEm) * scale;
  }
  
  getPath(x, y) {
    return this.glyph.getPath(x, y, this.fontSize);
  }
}

class Word {
  constructor() {
    this.letters = [];
    this.x = 0;
    this.y = 0;
  }
  
  addLetter(letter) {
    this.letters.push(letter);
    letter.word = this;
  }
  
  get width() {
    if (this.letters.length === 0) return 0;
    const last = this.letters[this.letters.length - 1];
    return last.x + last.advanceWidth - this.letters[0].x;
  }
}

class Line {
  constructor(y, letterSpacing = 0, fontStyle = 'normal') {
    this.words = [];
    this.y = y;
    this.letterSpacing = letterSpacing;
    this.fontStyle = fontStyle;
    this.x = 0;
  }
  
  addWord(word) {
    this.words.push(word);
    word.line = this;
  }
  
  get letters() {
    return this.words.flatMap(w => w.letters);
  }
}

class TextBlock {
  constructor(transform = { tx: 0, ty: 0, rotation: 0, scaleY: 1 }) {
    this.lines = [];
    this.transform = transform;
  }
  
  addLine(line) {
    this.lines.push(line);
    line.block = this;
  }
}

// ============ SVG PARSER ============

function parseSvgText(svgText, options = {}) {
  const { lineOverrides = {} } = options;
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const textElements = doc.querySelectorAll('text');
  
  const blocks = [];
  
  // Helper to parse a single transform and extract translate values
  function parseTranslate(transform) {
    if (!transform) return { tx: 0, ty: 0 };
    const match = transform.match(/translate\(([^,\s]+)[,\s]+([^)]+)\)/);
    if (match) {
      return { tx: parseFloat(match[1]), ty: parseFloat(match[2]) };
    }
    return { tx: 0, ty: 0 };
  }
  
  // Accumulate transforms from parent <g> elements
  function getParentGroupTransforms(el) {
    const transforms = []; // collect from innermost to outermost
    let parent = el.parentElement;
    while (parent && parent.nodeName !== 'svg') {
      if (parent.nodeName === 'g') {
        const transform = parent.getAttribute('transform');
        if (transform) {
          transforms.push({ id: parent.id, transform });
        }
      }
      parent = parent.parentElement;
    }
    // Reverse to get outermost first (proper transform order)
    transforms.reverse();
    
    // Compose into a single offset + rotation
    let offsetX = 0, offsetY = 0, rotation = 0;
    for (const { transform: t } of transforms) {
      const trans = parseTranslate(t);
      const rotMatch = t.match(/rotate\(([^)]+)\)/);
      const rot = rotMatch ? parseFloat(rotMatch[1]) : 0;
      
      // If we have accumulated rotation, the translate is in rotated space
      if (rotation !== 0) {
        const rad = rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rx = trans.tx * cos - trans.ty * sin;
        const ry = trans.tx * sin + trans.ty * cos;
        offsetX += rx;
        offsetY += ry;
      } else {
        offsetX += trans.tx;
        offsetY += trans.ty;
      }
      rotation += rot;
    }
    return { offsetX, offsetY, rotation };
  }
  
  textElements.forEach(textEl => {
    const transform = textEl.getAttribute('transform') || '';
    const groupTransforms = getParentGroupTransforms(textEl);
    
    let tx = 0, ty = 0, rotation = 0, scaleX = 1, scaleY = 1;
    let matrix = null; // Store raw matrix for complex transforms
    
    const matrixMatch = transform.match(/matrix\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    if (matrixMatch) {
      const [, a, b, c, d, e, f] = matrixMatch.map(parseFloat);
      tx = e;
      ty = f;
      // Check if this is a simple scale matrix (no rotation/skew)
      if (b === 0 && c === 0) {
        scaleX = a;
        scaleY = d;
      } else {
        // Complex matrix - store it for direct application
        matrix = [a, b, c, d, e, f];
      }
    } else {
      const translateMatch = transform.match(/translate\(([^,\s]+)[,\s]+([^)]+)\)/);
      const rotateMatch = transform.match(/rotate\(([^)]+)\)/);
      tx = translateMatch ? parseFloat(translateMatch[1]) : 0;
      ty = translateMatch ? parseFloat(translateMatch[2]) : 0;
      rotation = rotateMatch ? parseFloat(rotateMatch[1]) : 0;
    }
    
    // Add parent group transforms
    // IMPORTANT: If parent has rotation, the child's translate is in rotated space
    // We need to rotate the child's translate by the parent's rotation before adding
    const parentRot = groupTransforms.rotation;
    if (parentRot !== 0) {
      const rad = parentRot * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rtx = tx * cos - ty * sin;
      const rty = tx * sin + ty * cos;
      tx = rtx;
      ty = rty;
    }
    tx += groupTransforms.offsetX;
    ty += groupTransforms.offsetY;
    rotation += parentRot;
    
    // If we have a complex matrix, update its e/f values with the parent offset
    if (matrix) {
      matrix[4] = tx;  // e
      matrix[5] = ty;  // f
    }
    // Normalize rotation (360 = 0)
    rotation = rotation % 360;
    
    // Check for right-alignment (negative x values in tspans)
    // XD sometimes exports right-aligned text with wrong translate, putting text off-screen
    // Only compensate if the text would actually be off-screen (negative x position)
    const tspans = textEl.querySelectorAll('tspan');
    const xValues = [...tspans].map(ts => parseFloat(ts.getAttribute('x'))).filter(x => !isNaN(x));
    const minX = Math.min(...xValues, 0);
    if (minX < 0 && (tx + minX) < 0) {
      // Text would be off-screen left - shift it right
      tx += Math.abs(minX);
    }
    
    const fontSize = parseFloat(textEl.getAttribute('font-size') || 35);
    const fill = textEl.getAttribute('fill') || '#b1b1b1';
    const opacity = parseFloat(textEl.getAttribute('opacity') || 1);
    const baseLetterSpacing = textEl.getAttribute('letter-spacing') || '0em';
    
    const baseFontFamily = textEl.getAttribute('font-family') || '';
    let fontVariant = 'text';
    let fontSubvariant = null; // for special fonts like fleurons
    if (baseFontFamily.includes('Fleurons')) {
      fontVariant = 'txt';
      fontSubvariant = 'fleurons';
    } else if (baseFontFamily.includes('ADolphin') || baseFontFamily.includes('HoeflerTxt')) {
      fontVariant = 'txt';
    }
    
    const block = new TextBlock({ tx, ty, rotation, scaleX, scaleY, matrix, fontSize, fill, opacity, fontVariant, fontSubvariant });
    
    const parseLetterSpacing = (ls) => {
      if (!ls) return 0;
      const match = ls.match(/^([\d.-]+)em$/);
      if (!match) return 0;
      return parseFloat(match[1]);
    };
    
    const baseLsEm = parseLetterSpacing(baseLetterSpacing);
    
    const segments = [];
    
    function extractSegments(node, inheritedLs, inheritedStyle) {
      const nodeLs = node.getAttribute ? node.getAttribute('letter-spacing') : null;
      const nodeStyle = node.getAttribute ? node.getAttribute('font-style') : null;
      
      // XD bug workaround: letter-spacing on parent <text> only applies to italic tspans
      // Regular tspans without explicit letter-spacing get 0, not the inherited value
      // Italic tspans inherit from parent
      const style = nodeStyle || inheritedStyle;
      const isItalic = style === 'italic';
      const ls = nodeLs ? parseLetterSpacing(nodeLs) : (isItalic ? inheritedLs : 0);
      
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent;
          if (text.length > 0 && (text.trim() || /^\s+$/.test(text))) {
            let x = null, y = null;
            let ancestor = node;
            while (ancestor && ancestor.nodeName !== 'text') {
              if (ancestor.getAttribute) {
                if (x === null && ancestor.getAttribute('x')) x = parseFloat(ancestor.getAttribute('x'));
                if (y === null && ancestor.getAttribute('y')) y = parseFloat(ancestor.getAttribute('y'));
              }
              ancestor = ancestor.parentNode;
            }
            
            segments.push({
              text,
              x: x || 0,
              y: y || 0,
              letterSpacing: ls,
              fontStyle: style
            });
          }
        } else if (child.nodeName === 'tspan') {
          extractSegments(child, ls, style);
        }
      }
    }
    
    extractSegments(textEl, baseLsEm, 'normal');
    
    const linesByY = new Map();
    for (const seg of segments) {
      const key = seg.y;
      if (!linesByY.has(key)) {
        linesByY.set(key, []);
      }
      linesByY.get(key).push(seg);
    }
    
    for (const [y, segs] of linesByY) {
      const line = new Line(y, segs[0].letterSpacing, segs[0].fontStyle);
      line.x = segs[0].x;
      line.segments = segs;
      line.fontSize = fontSize;
      line.rawLetterSpacing = segs[0].letterSpacing;
      block.addLine(line);
    }
    
    block.lines.sort((a, b) => a.y - b.y);
    
    if (block.lines.length > 0) {
      blocks.push(block);
    }
  });
  
  // Assign global line indices and apply overrides
  let globalLineIdx = 0;
  for (const block of blocks) {
    for (const line of block.lines) {
      line.globalIndex = globalLineIdx++;
      
      const override = lineOverrides[line.globalIndex];
      if (override?.fix006 && Math.abs(line.letterSpacing - 0.06) < 0.001) {
        line.letterSpacing = 0;
        for (const seg of line.segments) {
          if (Math.abs(seg.letterSpacing - 0.06) < 0.001) {
            seg.letterSpacing = 0;
          }
        }
      }
      if (override?.letterSpacing !== undefined) {
        line.letterSpacing = override.letterSpacing;
        for (const seg of line.segments) {
          seg.letterSpacing = override.letterSpacing;
        }
      }
      if (override?.segmentLs) {
        for (let i = 0; i < line.segments.length; i++) {
          if (override.segmentLs[i] !== undefined) {
            line.segments[i].letterSpacing = override.segmentLs[i];
          }
        }
        line.letterSpacing = line.segments[0]?.letterSpacing || 0;
      }
    }
  }
  
  return blocks;
}

// ============ LAYOUT ENGINE ============

function layoutBlock(block, fonts, calibration) {
  const { kernScale, lsScale, lsOffset, spaceScale, spaceLs, noMirrorKern, noMirrorLs } = calibration;
  
  let fontFamily = fonts[block.transform.fontVariant] || fonts.text;
  // Handle special font subvariants like fleurons
  const subvariant = block.transform.fontSubvariant;
  if (subvariant === 'fleurons' && fonts.txt?.fleurons) {
    fontFamily = { regular: fonts.txt.fleurons, italic: fonts.txt.fleurons };
  }
  const isMirrored = block.transform.scaleY === -1;
  const effectiveKernScale = (isMirrored && noMirrorKern) ? 0 : kernScale;
  const effectiveLsScale = (isMirrored && noMirrorLs) ? 0 : lsScale;
  
  for (const line of block.lines) {
    let cursor = line.x;
    let prevLetter = null;
    
    for (let segIdx = 0; segIdx < line.segments.length; segIdx++) {
      const segment = line.segments[segIdx];
      const nextSegment = line.segments[segIdx + 1];
      const font = segment.fontStyle === 'italic' ? fontFamily.italic : fontFamily.regular;
      const fontSize = line.fontSize;
      
      const lsEm = segment.letterSpacing * effectiveLsScale + lsOffset;
      const lsPx = lsEm * fontSize;
      
      let currentWord = new Word();
      line.addWord(currentWord);
      
      const chars = [...segment.text];
      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const nextChar = chars[i + 1];
        const isTrailingSpace = char === ' ' && !nextChar && nextSegment;
        
        if (char === ' ') {
          const spaceLetter = new Letter(' ', font, fontSize);
          
          // Apply kerning from previous letter to space
          if (prevLetter && prevLetter.font === font) {
            cursor += prevLetter.kernTo(spaceLetter, effectiveKernScale);
          }
          
          // For trailing spaces at segment boundary, use next segment's letter-spacing
          let spaceLsPx = lsPx;
          if (isTrailingSpace && nextSegment) {
            const nextLsEm = nextSegment.letterSpacing * effectiveLsScale + lsOffset;
            spaceLsPx = nextLsEm * fontSize;
          }
          
          const spaceWidth = spaceLetter.advanceWidth * spaceScale;
          cursor += spaceWidth + (spaceLs ? lsPx : 0);  // space gets its own segment's letter-spacing after
          
          // Apply kerning from space to next letter
          if (nextChar && nextChar !== ' ') {
            const nextLetter = new Letter(nextChar, font, fontSize);
            cursor += spaceLetter.kernTo(nextLetter, effectiveKernScale);
          }
          
          currentWord = new Word();
          line.addWord(currentWord);
          prevLetter = null;
          continue;
        }
        
        const letter = new Letter(char, font, fontSize);
        
        if (prevLetter && prevLetter.font === letter.font) {
          const kern = prevLetter.kernTo(letter, effectiveKernScale);
          cursor += kern;
        }
        
        letter.x = cursor;
        letter.y = line.y;
        
        currentWord.addLetter(letter);
        
        // Add letter-spacing after every letter (XD style), except at end of line
        const hasMoreText = nextChar || nextSegment;
        const addLs = spaceLs ? hasMoreText : (nextChar && nextChar !== ' ');
        cursor += letter.advanceWidth + (addLs ? lsPx : 0);
        prevLetter = letter;
      }
    }
    
    line.words = line.words.filter(w => w.letters.length > 0);
  }
}

// ============ RENDERER ============

function renderBlock(ctx, block, calibration, options = {}) {
  const { tx, ty, rotation, scaleX = 1, scaleY = 1, matrix, fill, opacity } = block.transform;
  const { baselineOffset = 0, xOffset = 0 } = calibration;
  const { showBoxes, showItalic = true, blockOffset = { x: 0, y: 0 } } = options;
  
  ctx.save();
  
  if (matrix) {
    // Complex matrix transform - apply directly
    const [a, b, c, d, e, f] = matrix;
    ctx.transform(a, b, c, d, e + xOffset + blockOffset.x, f + baselineOffset + blockOffset.y);
  } else {
    ctx.translate(tx + xOffset + blockOffset.x, ty + baselineOffset + blockOffset.y);
    if (rotation) {
      ctx.rotate(rotation * Math.PI / 180);
    }
    if (scaleX !== 1 || scaleY !== 1) {
      ctx.scale(scaleX, scaleY);
    }
  }
  
  ctx.fillStyle = fill || '#b1b1b1';
  ctx.globalAlpha = opacity || 1;
  
  for (const line of block.lines) {
    for (const word of line.words) {
      for (const letter of word.letters) {
        if (!showItalic && letter.font.names.fontSubfamily?.en === 'Italic') {
          continue;
        }
        
        const path = letter.getPath(letter.x, letter.y);
        path.fill = ctx.fillStyle;
        path.draw(ctx);
        
        if (showBoxes) {
          ctx.save();
          const isItalic = letter.font.names.fontSubfamily?.en === 'Italic';
          ctx.strokeStyle = isItalic ? '#ff00ff' : '#00ffff';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 1;
          
          const bx = letter.x + letter.bbox.x1;
          const by = letter.y - letter.bbox.y2;
          ctx.strokeRect(bx, by, letter.bbox.width, letter.bbox.height);
          
          ctx.fillStyle = '#ffff00';
          ctx.fillRect(letter.x - 1, letter.y - 1, 3, 3);
          
          ctx.restore();
        }
      }
    }
  }
  
  ctx.restore();
}

// ============ MAIN RENDERER CLASS ============

export class SvgTextRenderer {
  constructor(options = {}) {
    this.fonts = {
      text: { regular: null, italic: null },
      txt: { regular: null, italic: null, fleurons: null }
    };
    
    this.calibration = {
      kernScale: 1.0,
      lsScale: 1.0,
      lsOffset: 0,
      baselineOffset: 0,
      xOffset: 0,
      spaceScale: 1.0,
      spaceLs: true,
      noMirrorKern: false,
      noMirrorLs: false,
      ...options.calibration
    };
  }
  
  /**
   * Load fonts for rendering
   * @param {Object} fontPaths - paths to font files
   * @param {string} fontPaths.regular - path to regular font
   * @param {string} fontPaths.italic - path to italic font
   * @param {string} [fontPaths.txtRegular] - path to ADolphin regular
   * @param {string} [fontPaths.txtItalic] - path to ADolphin italic
   * @param {string} [fontPaths.fleurons] - path to fleurons font
   */
  async loadFonts(fontPaths) {
    if (fontPaths.regular) {
      this.fonts.text.regular = await opentype.load(fontPaths.regular);
    }
    if (fontPaths.italic) {
      this.fonts.text.italic = await opentype.load(fontPaths.italic);
    }
    if (fontPaths.txtRegular) {
      this.fonts.txt.regular = await opentype.load(fontPaths.txtRegular);
    }
    if (fontPaths.txtItalic) {
      this.fonts.txt.italic = await opentype.load(fontPaths.txtItalic);
    }
    if (fontPaths.fleurons) {
      this.fonts.txt.fleurons = await opentype.load(fontPaths.fleurons);
    }
    return this;
  }
  
  /**
   * Set calibration parameters
   */
  setCalibration(calibration) {
    this.calibration = { ...this.calibration, ...calibration };
    return this;
  }
  
  /**
   * Parse SVG text into blocks
   * @param {string} svgText - SVG content as string
   * @param {Object} [options] - parsing options
   * @param {Object} [options.lineOverrides] - per-line letter-spacing overrides
   * @returns {TextBlock[]} parsed text blocks
   */
  parse(svgText, options = {}) {
    return parseSvgText(svgText, options);
  }
  
  /**
   * Layout text blocks (calculate letter positions)
   * @param {TextBlock[]} blocks - parsed blocks
   */
  layout(blocks) {
    for (const block of blocks) {
      // Reset words before re-layout
      for (const line of block.lines) {
        line.words = [];
      }
      layoutBlock(block, this.fonts, this.calibration);
    }
    return blocks;
  }
  
  /**
   * Render blocks to canvas
   * @param {CanvasRenderingContext2D} ctx - canvas context
   * @param {TextBlock[]} blocks - layouted blocks
   * @param {Object} [options] - render options
   * @param {boolean} [options.showBoxes] - show letter bounding boxes
   * @param {boolean} [options.showItalic] - render italic text (default: true)
   * @param {Object[]} [options.blockOffsets] - per-block position offsets
   */
  renderToContext(ctx, blocks, options = {}) {
    const { blockOffsets = [] } = options;
    
    for (let i = 0; i < blocks.length; i++) {
      renderBlock(ctx, blocks[i], this.calibration, {
        ...options,
        blockOffset: blockOffsets[i] || { x: 0, y: 0 }
      });
    }
    return this;
  }
  
  /**
   * Full render pipeline: parse -> layout -> render
   * @param {string} svgText - SVG content
   * @param {Object} [options] - options
   * @param {number} [options.width=1080] - canvas width
   * @param {number} [options.height=1080] - canvas height
   * @param {Object} [options.lineOverrides] - per-line overrides
   * @param {boolean} [options.showBoxes] - show letter boxes
   * @returns {HTMLCanvasElement} rendered canvas
   */
  render(svgText, options = {}) {
    const { width = 1080, height = 1080, lineOverrides, ...renderOptions } = options;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const blocks = this.parse(svgText, { lineOverrides });
    this.layout(blocks);
    this.renderToContext(ctx, blocks, renderOptions);
    
    return canvas;
  }
  
  /**
   * Render to existing canvas
   * @param {HTMLCanvasElement} canvas - target canvas
   * @param {string} svgText - SVG content
   * @param {Object} [options] - options
   * @returns {TextBlock[]} parsed and layouted blocks
   */
  renderTo(canvas, svgText, options = {}) {
    const { lineOverrides, clear = true, ...renderOptions } = options;
    const ctx = canvas.getContext('2d');
    
    if (clear) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    const blocks = this.parse(svgText, { lineOverrides });
    this.layout(blocks);
    this.renderToContext(ctx, blocks, renderOptions);
    
    return blocks;
  }
}

// Export utilities for advanced usage
export { parseSvgText, layoutBlock, renderBlock, TextBlock, Line, Word, Letter };
