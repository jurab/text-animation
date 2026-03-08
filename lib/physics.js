/**
 * Common physics primitives for poems artifacts.
 *
 * This is a reference library - artifacts are self-contained and don't import this.
 * Use this for new work or as documentation of where patterns came from.
 */

// ============ RANDOM ============

/**
 * Box-Muller transform for Gaussian random numbers.
 * Used in: 04-langevin-chaos, 07-pixel-letters, 08-text-morph
 */
export function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ============ LANGEVIN DYNAMICS ============

/**
 * Langevin equation force calculation.
 * Models Brownian motion with damping and thermal noise.
 *
 * Used in: 04-langevin-chaos, 08-text-morph
 *
 * @param {number} dx - Distance to target (x)
 * @param {number} dy - Distance to target (y)
 * @param {number} vx - Current velocity (x)
 * @param {number} vy - Current velocity (y)
 * @param {Object} params - Physics parameters
 * @param {number} params.wellStrength - Pull toward target (typical: 0.06-0.1)
 * @param {number} params.damping - Velocity damping (typical: 0.1-0.2)
 * @param {number} params.temperature - Thermal noise level (typical: 0.001-1.5)
 * @returns {{fx: number, fy: number}} Force vector
 */
export function langevinForce(dx, dy, vx, vy, { wellStrength, damping, temperature }) {
  // Harmonic well force (pulls toward target)
  let fx = dx * wellStrength;
  let fy = dy * wellStrength;

  // Damping (opposes velocity)
  fx -= damping * vx;
  fy -= damping * vy;

  // Thermal noise (fluctuation-dissipation relation)
  const noiseStrength = Math.sqrt(2 * damping * temperature);
  fx += noiseStrength * gaussianRandom();
  fy += noiseStrength * gaussianRandom();

  return { fx, fy };
}

/**
 * Lock threshold check - snap to target when cold enough.
 * Prevents residual flicker at endpoints.
 *
 * Discovered in: 04-langevin-chaos (flicker bug fix)
 * Used in: 08-text-morph
 *
 * @param {number} temperature - Current temperature
 * @param {number} minTemp - Minimum temperature (TEMPERATURE_COLD)
 * @param {number} multiplier - Lock threshold multiplier (typical: 1.5)
 * @returns {boolean} True if should lock to target
 */
export function shouldLock(temperature, minTemp, multiplier = 1.5) {
  return temperature <= minTemp * multiplier;
}

// ============ TEMPERATURE CURVES ============

/**
 * Parabolic temperature curve - peaks at midpoint.
 * Good for transitions: cold → hot → cold
 *
 * Used in: 08-text-morph
 *
 * @param {number} progress - 0-1 progress through transition
 * @param {number} coldTemp - Temperature at endpoints
 * @param {number} hotTemp - Temperature at midpoint
 * @returns {number} Current temperature
 */
export function parabolicTemperature(progress, coldTemp, hotTemp) {
  const curve = 1 - Math.pow(2 * (progress - 0.5), 2);
  return coldTemp + (hotTemp - coldTemp) * Math.max(0, curve);
}

// ============ TIMING / STAGGER ============

/**
 * Calculate staggered local progress for wave effects.
 * Each element starts/ends its transition at different times.
 *
 * Used in: 08-text-morph (left-to-right letter wave)
 *
 * @param {number} globalProgress - 0-1 overall progress
 * @param {number} index - This element's index
 * @param {number} total - Total number of elements
 * @param {number} stagger - Delay between elements (typical: 0.05-0.1)
 * @returns {number} 0-1 local progress for this element
 */
export function staggeredProgress(globalProgress, index, total, stagger) {
  const localStart = index * stagger;
  const localEnd = 1 - (total - 1 - index) * stagger;

  if (globalProgress <= localStart) return 0;
  if (globalProgress >= localEnd) return 1;
  return (globalProgress - localStart) / (localEnd - localStart);
}

// ============ SCROLL ============

/**
 * Map scroll position to normalized progress within a range.
 *
 * Used in: most artifacts
 *
 * @param {number} scrollProgress - 0-1 normalized scroll position
 * @param {number} start - Scroll position where effect starts
 * @param {number} end - Scroll position where effect ends
 * @returns {number} 0-1 progress within the range
 */
export function scrollToProgress(scrollProgress, start, end) {
  if (scrollProgress <= start) return 0;
  if (scrollProgress >= end) return 1;
  return (scrollProgress - start) / (end - start);
}

/**
 * Get normalized scroll progress from window.
 * Exposes to window.scrollProgress for observer access.
 *
 * Used in: 07-pixel-letters, 08-text-morph
 */
export function setupScrollProgress() {
  window.scrollProgress = 0;

  function onScroll() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollProgress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  return onScroll;
}

// ============ ALGORITHMS ============

/**
 * Longest Common Subsequence for string matching.
 * Returns matched indices in both strings.
 *
 * Used in: 08-text-morph (letter-aware morphing)
 *
 * @param {string[]} a - First array of items
 * @param {string[]} b - Second array of items
 * @returns {{matchesA: Set, matchesB: Set, pairs: Array}} Matched indices
 */
export function lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i-1] === b[j-1]) {
        dp[i][j] = dp[i-1][j-1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
  }

  // Backtrack
  const matchesA = new Set();
  const matchesB = new Set();
  const pairs = [];
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (a[i-1] === b[j-1]) {
      matchesA.add(i-1);
      matchesB.add(j-1);
      pairs.push([i-1, j-1]);
      i--; j--;
    } else if (dp[i-1][j] > dp[i][j-1]) {
      i--;
    } else {
      j--;
    }
  }

  return { matchesA, matchesB, pairs: pairs.reverse() };
}

// ============ TYPICAL PARAMETER RANGES ============

/**
 * Reference parameter values from artifacts.
 * Not for import - just documentation.
 */
export const REFERENCE_PARAMS = {
  // Langevin dynamics (04, 08)
  langevin: {
    temperatureCold: 0.001,    // Locked state
    temperatureHot: 0.6,       // Gentle chaos (08) to 1.2 (visible chaos)
    damping: 0.15,             // Typical range 0.1-0.2
    wellStrength: 0.06,        // Typical range 0.05-0.1
    lockMultiplier: 1.5,       // Lock when temp <= cold * this
  },

  // Stagger timing (08)
  stagger: {
    letterStagger: 0.08,       // Delay between letters
    morphStart: 0.15,          // Scroll position
    morphEnd: 0.85,
  },

  // Pixel extraction (07, 08)
  pixels: {
    alphaThreshold: 128,       // Min alpha to count as pixel (0-255)
  }
};
