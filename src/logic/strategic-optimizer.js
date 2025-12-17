/**
 * Strategic Optimizer
 *
 * Original 5-phase optimization algorithm that prioritizes strategic value
 * (layer distance, holes, edge completion) over routing considerations.
 *
 * This is the "classic" approach where squares are selected first based on
 * strategic criteria, then routing is calculated separately afterward.
 */

import {
  MODE_MULTIPLIERS,
  rectFromIJ,
  calculateLayerDistance,
  manhattanDistance,
  getSearchBounds,
  getNeighborKeys,
  isOnUbersquadratBorder,
  analyzeEdges,
  detectHoles,
  buildHoleMap
} from './optimizer-shared.js';

/**
 * Main strategic optimization function
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
 * @returns {Array} Array of [[lat,lon], [lat,lon]] rectangle bounds
 */
export function optimizeStrategic(
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
  const size = `${base.maxI - base.minI + 1}×${base.maxJ - base.minJ + 1}`;
  console.log(`\n=== STRATEGIC OPTIMIZER === Übersquadrat: ${size}, Visited: ${visitedSet.size}, Mode: ${optimizationMode}`);

  // === PHASE 1: EDGE ANALYSIS ===
  const edges = analyzeEdges(base, visitedSet);

  // === PHASE 2: HOLE DETECTION ===
  const holes = detectHoles(base, visitedSet, maxHoleSize, LAT_STEP, LON_STEP, originLat, originLon);
  const squareToHoleMap = buildHoleMap(holes);

  // === PHASE 3: FIND ALL PERIMETER SQUARES ===
  function findPerimeterSquares() {
    const candidates = new Map();
    const bounds = getSearchBounds(base, 5);

    // Check each square in the search area
    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        const key = `${i},${j}`;

        // Skip if already visited
        if (visitedSet.has(key)) continue;

        // CRITICAL: Only consider squares OUTSIDE the ubersquadrat
        const positions = {
          N: i > base.maxI,
          S: i < base.minI,
          E: j > base.maxJ,
          W: j < base.minJ
        };

        // Calculate layer distance from ubersquadrat boundary
        const layerDist = calculateLayerDistance(i, j, base).total;

        // Only include squares within searchRadius layers from ubersquadrat
        if (layerDist > 5) continue;

        // Determine which edge based on position relative to ubersquadrat boundary
        const edge = Object.keys(positions).filter(k => positions[k]).join('');

        candidates.set(key, { i, j, edge, key });
      }
    }

    return Array.from(candidates.values());
  }

  const allCandidates = findPerimeterSquares();
  const unvisited = allCandidates.filter(c => !visitedSet.has(`${c.i},${c.j}`));
  console.log(`Candidates: ${unvisited.length} unvisited`);

  // === PHASE 4: STRATEGIC SCORING ===
  const scored = unvisited.map(square => {
    let score = 100;

    // === LAYER DISTANCE (Primary factor) ===
    const isBorder = isOnUbersquadratBorder(square.i, square.j, base);
    const layerDistance = isBorder ? 0 : calculateLayerDistance(square.i, square.j, base).total;

    // Strongly prioritize proximity with bonuses AND penalties
    if (layerDistance === 0) score += 10000;
    else if (layerDistance === 1) score += 5000;
    else if (layerDistance === 2) score += 2000;
    else if (layerDistance === 3) score += 500;
    else if (layerDistance === 4) score -= 2000;
    else if (layerDistance >= 5) score -= 10000;

    // === EDGE COMPLETION ===
    const maxEdgeCompletion = ['N', 'S', 'E', 'W']
      .filter(dir => square.edge.includes(dir))
      .reduce((max, dir) => Math.max(max, edges[dir].completion), 0);
    let edgeBonus = Math.floor(maxEdgeCompletion * 5);

    // === HOLE FILLING ===
    const squareKey = `${square.i},${square.j}`;
    const hole = squareToHoleMap.get(squareKey);
    let holeSizeBonus = 0;

    if (hole) {
      // Reduce base multiplier: 2000 → 800
      // Apply layer-based reduction
      let holeMultiplier = 800;
      if (layerDistance >= 3) holeMultiplier = 400; // 50%
      if (layerDistance >= 5) holeMultiplier = 200; // 25%

      holeSizeBonus = hole.size * holeMultiplier;

      // Keep completion bonus but reduce: 3000 → 1500
      const unvisitedInHole = hole.squares.filter(
        sq => !visitedSet.has(sq.key) && sq.key !== squareKey
      ).length;
      if (unvisitedInHole === 0) score += 1500;
    }

    // === MODE MULTIPLIERS ===
    const mult = MODE_MULTIPLIERS[optimizationMode] || MODE_MULTIPLIERS.balanced;
    edgeBonus = Math.floor(edgeBonus * mult.edge);
    holeSizeBonus = Math.floor(holeSizeBonus * mult.hole);

    score += edgeBonus + holeSizeBonus;

    // === ADJACENCY ===
    const adjacency = getNeighborKeys(square.i, square.j).filter(n => visitedSet.has(n)).length;
    score += adjacency * 25;

    // === DIRECTION FILTER ===
    // direction is now an array of selected directions (e.g., ['N', 'E'])
    if (Array.isArray(direction) && direction.length < 4) {
      // Not all directions selected - apply filtering
      const matches = {
        N: square.i > base.maxI,
        S: square.i < base.minI,
        E: square.j > base.maxJ,
        W: square.j < base.minJ
      };

      // Check if square matches ANY of the selected directions
      const matchesAnyDirection = direction.some(dir => matches[dir]);

      // If doesn't match any selected direction, apply penalty
      if (!matchesAnyDirection) score -= 1000000;
    }
    // If all 4 directions selected or not an array, no filtering (all squares allowed)

    return { ...square, score, layerDistance };
  });

  // === PHASE 5: GREEDY ROUTE SELECTION ===
  const selected = [];
  const remaining = [...scored];

  if (remaining.length === 0) {
    console.log('No candidates available!');
    return [];
  }

  // Select first square (highest score)
  remaining.sort((a, b) => b.score - a.score);
  selected.push(remaining.shift());

  // Greedily select remaining squares (proximity + hole completion)
  while (selected.length < targetNew && remaining.length > 0) {
    const last = selected[selected.length - 1];

    remaining.forEach(sq => {
      const dist = manhattanDistance(sq, last);
      sq.routeScore = sq.score - dist * 100;

      // Bonus: Complete holes that have started to be filled
      const sqHole = squareToHoleMap.get(`${sq.i},${sq.j}`);
      if (sqHole && selected.some(s => squareToHoleMap.get(`${s.i},${s.j}`)?.id === sqHole.id)) {
        sq.routeScore += 1500;
      }
    });

    remaining.sort((a, b) => b.routeScore - a.routeScore);
    selected.push(remaining.shift());
  }

  console.log(`Selected ${selected.length} squares: ${selected.map(s => `(${s.i},${s.j})`).join(' → ')}`);

  const results = selected.map(s => rectFromIJ(s.i, s.j, originLat, originLon, LAT_STEP, LON_STEP));
  return results;
}
