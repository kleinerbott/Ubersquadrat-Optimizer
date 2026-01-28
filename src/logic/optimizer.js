import { CONFIG } from "./config";


const MODE_MULTIPLIERS = {
  edge: { edge: 3, hole: 0.3, layerPenalty: 1.0 },
  holes: { edge: 0.3, hole: 3, layerPenalty: 0.5 },
  balanced: { edge: 1, hole: 1, layerPenalty: 1.0 }
};


function rectFromIJ(i, j, originLat, originLon, LAT_STEP, LON_STEP) {
  const s = originLat + i * LAT_STEP;
  const w = originLon + j * LON_STEP;
  const n = s + LAT_STEP;
  const e = w + LON_STEP;
  return [[s, w], [n, e]];
}

/**
 * Calculate layer distance from Übersquadrat border
 * Returns {distI, distJ, total} where total is Chebyshev distance (max, not sum)
 * This ensures corners are in the same layer as edges, forming complete rings
 */
function calculateLayerDistance(i, j, base) {
  const distI = Math.max(0, Math.max(base.minI - i - 1, i - base.maxI - 1));
  const distJ = Math.max(0, Math.max(base.minJ - j - 1, j - base.maxJ - 1));
  return { distI, distJ, total: Math.max(distI, distJ) };
}

/**
 * Get search area bounds around Übersquadrat
 * @param {number} radius - Number of layers to search (default: 5)
 */
function getSearchBounds(base, radius = CONFIG.SCAN_RADIUS_RANGE) {
  return {
    minI: base.minI - radius,
    maxI: base.maxI + radius,
    minJ: base.minJ - radius,
    maxJ: base.maxJ + radius
  };
}


function getNeighborKeys(i, j) {
  return [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].map(([ni, nj]) => `${ni},${nj}`);
}


function isOnUbersquadratBorder(i, j, base) {
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
function analyzeEdge(name, fixedCoord, start, end, type, visitedSet) {
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

function analyzeEdges(base, visitedSet) {
  const edges = {
    N: analyzeEdge('N', base.maxI + 1, base.minJ, base.maxJ, 'row', visitedSet),
    S: analyzeEdge('S', base.minI - 1, base.minJ, base.maxJ, 'row', visitedSet),
    E: analyzeEdge('E', base.maxJ + 1, base.minI, base.maxI, 'col', visitedSet),
    W: analyzeEdge('W', base.minJ - 1, base.minI, base.maxI, 'col', visitedSet)
  };

  return edges;
}


/**
 * Flood-fill algorithm to find contiguous unvisited regions
 * @param {number} startI - Starting i coordinate
 * @param {number} startJ - Starting j coordinate
 * @param {Set} visited - Set of already processed squares (modified in-place)
 * @param {Function} isInBounds - Function to check if (i,j) is in search area
 * @param {Set} visitedSet - Set of visited squares from KML
 * @returns {Array} Array of {i, j, key} objects in the contiguous region
 */
function findContiguousRegion(startI, startJ, visited, isInBounds, visitedSet) {
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
function detectHoles(base, visitedSet, maxHoleSize) {
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

  return validHoles;
}

/**
 * Build map of square keys to their containing holes
 * @param {Array} holes - Array of hole objects
 * @returns {Map} Map of "i,j" → hole object
 */
function buildHoleMap(holes) {
  const squareToHoleMap = new Map();
  holes.forEach(hole => {
    hole.squares.forEach(sq => {
      squareToHoleMap.set(sq.key, hole);
    });
  });
  return squareToHoleMap;
}

// ===== MAIN OPTIMIZER =====

/**
 * Main optimization entry point
 *
 * @param {Object} base - Übersquadrat bounds {minI, maxI, minJ, maxJ}
 * @param {number} targetNew - Number of new squares to recommend
 * @param {Array} direction - Selected directions ['N', 'S', 'E', 'W']
 * @param {Set} visitedSet - Set of "i,j" visited squares
 * @param {number} LAT_STEP - Grid cell height (degrees)
 * @param {number} LON_STEP - Grid cell width (degrees)
 * @param {number} originLat - Grid origin latitude
 * @param {number} originLon - Grid origin longitude
 * @param {string} optimizationMode - 'balanced', 'edge', or 'holes'
 * @param {number} maxHoleSize - Maximum hole size to consider (1-20)
 * @returns {Object} {rectangles, metadata} - Array of rectangle bounds and metadata
 */
export function optimizeSquare(
  base,
  targetNew,
  direction,
  visitedSet,
  LAT_STEP,
  LON_STEP,
  originLat,
  originLon,
  optimizationMode = 'balanced',
  maxHoleSize = 5
) {
  //  PHASE 1: EDGE ANALYSIS 
  const edges = analyzeEdges(base, visitedSet);

  //  PHASE 2: HOLE DETECTION 
  const holes = detectHoles(base, visitedSet, maxHoleSize);
  const squareToHoleMap = buildHoleMap(holes);

  //  PHASE 3: FIND ALL PERIMETER SQUARES 
  function findPerimeterSquares() {
    const candidates = new Map();
    const bounds = getSearchBounds(base, 5);

    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        const key = `${i},${j}`;

        if (visitedSet.has(key)) continue;

        const positions = {
          N: i > base.maxI,
          S: i < base.minI,
          E: j > base.maxJ,
          W: j < base.minJ
        };

        const layerDist = calculateLayerDistance(i, j, base).total;

        if (layerDist > 5) continue;

        const edge = Object.keys(positions).filter(k => positions[k]).join('');

        candidates.set(key, { i, j, edge, key });
      }
    }

    return Array.from(candidates.values());
  }

  const allCandidates = findPerimeterSquares();
  const unvisited = allCandidates.filter(c => !visitedSet.has(`${c.i},${c.j}`));

  //  PHASE 4: STRATEGIC SCORING 
  const scored = unvisited.map(square => {
    let score = 100;

    const scoreBreakdown = {
      base: 100,
      layerScore: 0,
      edgeBonus: 0,
      holeBonus: 0,
      adjacencyBonus: 0
    };

    const isBorder = isOnUbersquadratBorder(square.i, square.j, base);
    const layerDistance = isBorder ? 0 : calculateLayerDistance(square.i, square.j, base).total;

    // Strongly prioritize proximity with bonuses AND penalties
    if (layerDistance === 0) scoreBreakdown.layerScore = 10000;
    else if (layerDistance === 1) scoreBreakdown.layerScore = 5000;
    else if (layerDistance === 2) scoreBreakdown.layerScore = 2000;
    else if (layerDistance === 3) scoreBreakdown.layerScore = 500;
    else if (layerDistance === 4) scoreBreakdown.layerScore = -2000;
    else if (layerDistance >= 5) scoreBreakdown.layerScore = -10000;

    // === EDGE COMPLETION MODE ===
    const maxEdgeCompletion = ['N', 'S', 'E', 'W']
      .filter(dir => square.edge.includes(dir))
      .reduce((max, dir) => Math.max(max, edges[dir].completion), 0);
    let edgeBonusRaw = Math.floor(maxEdgeCompletion * 30);  // max 3,000 no bonus

    // === HOLE FILLING MODE ===
    const squareKey = `${square.i},${square.j}`;
    const hole = squareToHoleMap.get(squareKey);
    let holeSizeBonusRaw = 0;
    let holeCompletionBonus = 0;

    if (hole) {
      let holeMultiplier = 200;   // max 2,000 for size 10
      if (layerDistance >= 3) holeMultiplier = 150;
      if (layerDistance >= 5) holeMultiplier = 75;

      holeSizeBonusRaw = hole.size * holeMultiplier;

      const unvisitedInHole = hole.squares.filter(
        sq => !visitedSet.has(sq.key) && sq.key !== squareKey
      ).length;
      if (unvisitedInHole === 0) {
        holeCompletionBonus = 1500;  
      }
    }

    //  MODE MULTIPLIERS 
    const mult = MODE_MULTIPLIERS[optimizationMode] || MODE_MULTIPLIERS.balanced;

    // Apply layer penalty reduction in holes mode (negative scores only)
  if (mult.layerPenalty !== undefined && mult.layerPenalty !== 1.0) { 
    scoreBreakdown.layerScore = Math.floor(scoreBreakdown.layerScore   * mult.layerPenalty);
 }
    score += scoreBreakdown.layerScore;

    scoreBreakdown.edgeBonus = Math.floor(edgeBonusRaw * mult.edge);
    scoreBreakdown.holeBonus = Math.floor((holeSizeBonusRaw + holeCompletionBonus) * mult.hole);

    score += scoreBreakdown.edgeBonus + scoreBreakdown.holeBonus;

    // === ADJACENCY ===
    const adjacency = getNeighborKeys(square.i, square.j).filter(n => visitedSet.has(n)).length;
    scoreBreakdown.adjacencyBonus = adjacency * 25;
    score += scoreBreakdown.adjacencyBonus;

    // === DIRECTION FILTER ===
    if (Array.isArray(direction) && direction.length < 4) {
      const matches = {
        N: square.i > base.maxI,
        S: square.i < base.minI,
        E: square.j > base.maxJ,
        W: square.j < base.minJ
      };

      const matchesAnyDirection = direction.some(dir => matches[dir]);

      if (!matchesAnyDirection) score -= 1000000;
    }

    return { ...square, score, scoreBreakdown, layerDistance, hole };
  });

  //  PHASE 5: SELECT TOP N BY SCORE 
  if (scored.length === 0) {
    return { rectangles: [], metadata: [] };
  }

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, targetNew);

  const rectangles = selected.map(s => rectFromIJ(s.i, s.j, originLat, originLon, LAT_STEP, LON_STEP));

  const metadata = selected.map((s, index) => ({
    bounds: rectangles[index],
    gridCoords: { i: s.i, j: s.j },
    score: s.score,
    scoreBreakdown: s.scoreBreakdown,
    layerDistance: s.layerDistance,
    selectionOrder: index + 1,
    edge: s.edge && s.edge.length > 0 ? s.edge : undefined,
    hole: s.hole ? { size: s.hole.size, id: s.hole.id } : undefined
  }));

  return {
    rectangles,
    metadata
  };
}
