/**
 * Shared Optimizer Utilities
 *
 * Common helper functions used by both strategic and orienteering optimizers.
 * Extracted to avoid code duplication and improve maintainability.
 */

// ===== CONSTANTS =====

/**
 * Mode-specific scoring multipliers
 * - edge: Prioritize edge expansion
 * - holes: Prioritize filling gaps
 * - balanced: Equal weight to both
 */
export const MODE_MULTIPLIERS = {
  edge: { edge: 3, hole: 0.3 },
  holes: { edge: 0.3, hole: 2 },
  balanced: { edge: 1, hole: 1 }
};

// ===== UTILITY FUNCTIONS =====

/**
 * Convert grid coordinates (i,j) to rectangle bounds [lat,lon]
 */
export function rectFromIJ(i, j, originLat, originLon, LAT_STEP, LON_STEP) {
  const s = originLat + i * LAT_STEP;
  const w = originLon + j * LON_STEP;
  const n = s + LAT_STEP;
  const e = w + LON_STEP;
  return [[s, w], [n, e]];
}

/**
 * Convert grid coordinates (i,j) to center point {lat, lon}
 */
export function getSquareCenter(i, j, originLat, originLon, LAT_STEP, LON_STEP) {
  const s = originLat + i * LAT_STEP;
  const w = originLon + j * LON_STEP;
  return {
    lat: s + LAT_STEP / 2,
    lon: w + LON_STEP / 2
  };
}

/**
 * Convert square coordinates to "i,j" key string
 */
export function getSquareKey(i, j) {
  return `${i},${j}`;
}

/**
 * Parse "i,j" key string to {i, j} coordinates
 */
export function parseSquareKey(key) {
  const [i, j] = key.split(',').map(Number);
  return { i, j };
}

/**
 * Calculate layer distance from Übersquadrat border
 * Returns {distI, distJ, total} where total is Manhattan distance
 */
export function calculateLayerDistance(i, j, base) {
  const distI = Math.max(0, Math.max(base.minI - i - 1, i - base.maxI - 1));
  const distJ = Math.max(0, Math.max(base.minJ - j - 1, j - base.maxJ - 1));
  return { distI, distJ, total: distI + distJ };
}

/**
 * Calculate Manhattan distance between two grid points
 */
export function manhattanDistance(p1, p2) {
  return Math.abs(p1.i - p2.i) + Math.abs(p1.j - p2.j);
}

/**
 * Get search area bounds around Übersquadrat
 * @param {number} radius - Number of layers to search (default: 5)
 */
export function getSearchBounds(base, radius = 5) {
  return {
    minI: base.minI - radius,
    maxI: base.maxI + radius,
    minJ: base.minJ - radius,
    maxJ: base.maxJ + radius
  };
}

/**
 * Get keys of 4 neighboring squares (N, S, E, W)
 */
export function getNeighborKeys(i, j) {
  return [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].map(([ni, nj]) => `${ni},${nj}`);
}

/**
 * Check if square is on the immediate border (Layer 0) of Übersquadrat
 */
export function isOnUbersquadratBorder(i, j, base) {
  return (
    (i === base.maxI + 1 && j >= base.minJ - 1 && j <= base.maxJ + 1) ||
    (i === base.minI - 1 && j >= base.minJ - 1 && j <= base.maxJ + 1) ||
    (j === base.maxJ + 1 && i >= base.minI - 1 && i <= base.maxI + 1) ||
    (j === base.minJ - 1 && i >= base.minI - 1 && i <= base.maxI + 1)
  );
}

// ===== EDGE ANALYSIS =====

/**
 * Analyze a single edge (N, S, E, or W) of the Übersquadrat
 * Returns edge completion statistics
 */
export function analyzeEdge(name, fixedCoord, start, end, type, visitedSet) {
  const squares = [];
  let unvisitedCount = 0;

  for (let k = start; k <= end; k++) {
    const [i, j] = type === 'row' ? [fixedCoord, k] : [k, fixedCoord];
    const key = `${i},${j}`;
    const visited = visitedSet.has(key);

    squares.push({ i, j, key, visited });
    if (!visited) unvisitedCount++;
  }

  const total = end - start + 1;
  const visitedCount = total - unvisitedCount;
  const completion = (visitedCount / total) * 100;

  return {
    name,
    squares,
    total,
    unvisitedCount,
    visitedCount,
    completion,
    canExpand: unvisitedCount === 0
  };
}

/**
 * Analyze all 4 edges of the Übersquadrat
 * Returns {N, S, E, W} edge analysis objects
 */
export function analyzeEdges(base, visitedSet) {
  const edges = {
    N: analyzeEdge('N', base.maxI + 1, base.minJ, base.maxJ, 'row', visitedSet),
    S: analyzeEdge('S', base.minI - 1, base.minJ, base.maxJ, 'row', visitedSet),
    E: analyzeEdge('E', base.maxJ + 1, base.minI, base.maxI, 'col', visitedSet),
    W: analyzeEdge('W', base.minJ - 1, base.minI, base.maxI, 'col', visitedSet)
  };

  const expandable = Object.values(edges).filter(e => e.canExpand);
  if (expandable.length > 0) {
    console.log(`Edges: ${expandable.map(e => e.name).join(',')} can expand!`);
  }

  return edges;
}

// ===== HOLE DETECTION =====

/**
 * Flood-fill algorithm to find contiguous unvisited regions
 * @param {number} startI - Starting i coordinate
 * @param {number} startJ - Starting j coordinate
 * @param {Set} visited - Set of already processed squares (modified in-place)
 * @param {Function} isInBounds - Function to check if (i,j) is in search area
 * @param {Set} visitedSet - Set of visited squares from KML
 * @returns {Array} Array of {i, j, key} objects in the contiguous region
 */
export function findContiguousRegion(startI, startJ, visited, isInBounds, visitedSet) {
  const region = [];
  const queue = [[startI, startJ]];
  const regionVisited = new Set();
  const startKey = `${startI},${startJ}`;
  regionVisited.add(startKey);

  while (queue.length > 0) {
    const [i, j] = queue.shift();
    const key = `${i},${j}`;

    // Skip if already visited by overall algorithm or in visited set
    if (visited.has(key) || visitedSet.has(key)) continue;
    if (!isInBounds(i, j)) continue;

    region.push({ i, j, key });
    visited.add(key);

    // Check 4 neighbors
    const neighborKeys = getNeighborKeys(i, j);
    const neighbors = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];

    for (let idx = 0; idx < neighbors.length; idx++) {
      const [ni, nj] = neighbors[idx];
      const nKey = neighborKeys[idx];
      if (!regionVisited.has(nKey) && !visitedSet.has(nKey) && isInBounds(ni, nj)) {
        regionVisited.add(nKey);
        queue.push([ni, nj]);
      }
    }
  }

  return region;
}

/**
 * Detect all holes (contiguous unvisited regions) within search area
 * @param {Object} base - Übersquadrat bounds {minI, maxI, minJ, maxJ}
 * @param {Set} visitedSet - Set of "i,j" visited squares
 * @param {number} maxHoleSize - Maximum hole size to keep (1-20)
 * @returns {Array} Array of hole objects {id, squares, size, avgLayer}
 */
export function detectHoles(base, visitedSet, maxHoleSize, LAT_STEP, LON_STEP, originLat, originLon) {
  const searchBounds = getSearchBounds(base, 5);

  function isInSearchBounds(i, j) {
    return (
      i >= searchBounds.minI && i <= searchBounds.maxI &&
      j >= searchBounds.minJ && j <= searchBounds.maxJ
    );
  }

  const holes = [];
  const processedSquares = new Set();

  // Scan search area to find all holes
  for (let i = searchBounds.minI; i <= searchBounds.maxI; i++) {
    for (let j = searchBounds.minJ; j <= searchBounds.maxJ; j++) {
      const key = `${i},${j}`;

      if (processedSquares.has(key) || visitedSet.has(key)) continue;

      // Found an unvisited square - find its contiguous region
      const region = findContiguousRegion(i, j, processedSquares, isInSearchBounds, visitedSet);

      if (region.length > 0) {
        // Calculate average layer distance for this hole
        let totalLayerDist = 0;
        region.forEach(sq => {
          totalLayerDist += calculateLayerDistance(sq.i, sq.j, base).total;
        });
        const avgLayer = totalLayerDist / region.length;

        const hole = {
          id: holes.length,
          squares: region,
          size: region.length,
          avgLayer: avgLayer
        };
        holes.push(hole);
      }
    }
  }

  const validHoles = holes.filter(h => h.size <= maxHoleSize);
  console.log(`Holes: ${validHoles.length} valid (≤${maxHoleSize}), ${holes.length - validHoles.length} ignored`);

  return validHoles;
}

/**
 * Build map of square keys to their containing holes
 * @param {Array} holes - Array of hole objects
 * @returns {Map} Map of "i,j" → hole object
 */
export function buildHoleMap(holes) {
  const squareToHoleMap = new Map();
  holes.forEach(hole => {
    hole.squares.forEach(sq => {
      squareToHoleMap.set(sq.key, hole);
    });
  });
  return squareToHoleMap;
}
