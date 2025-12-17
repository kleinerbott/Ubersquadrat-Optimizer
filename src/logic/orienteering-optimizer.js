/**
 * Orienteering Optimizer
 *
 * Route-first optimization algorithm inspired by the Orienteering Problem.
 * Selects squares while considering cycling distance from the start, building
 * a continuous, efficient route rather than choosing strategically optimal
 * squares and routing through them afterward.
 *
 * Key differences from strategic optimizer:
 * - Distance budget (km) instead of square count
 * - Incremental route building (chooses next square based on route so far)
 * - Scores candidates by strategic_value / cycling_distance (efficiency)
 * - Guarantees continuous, cyclable routes
 */

import * as turf from '@turf/turf';
import {
  MODE_MULTIPLIERS,
  rectFromIJ,
  getSquareCenter,
  getSquareKey,
  calculateLayerDistance,
  getSearchBounds,
  getNeighborKeys,
  isOnUbersquadratBorder,
  analyzeEdges,
  detectHoles,
  buildHoleMap
} from './optimizer-shared.js';

// Road factor: cycling distance vs straight-line distance
// Roads rarely go perfectly straight, so actual cycling distance is ~1.4x straight-line
const ROAD_FACTOR = 1.4;

// Maximum gap distance (km) - how far a frontier square can be from the route
const MAX_GAP_DISTANCE = 10;

/**
 * Main orienteering optimization function
 *
 * @param {Object} base - Übersquadrat bounds {minI, maxI, minJ, maxJ}
 * @param {Object} params - Optimization parameters
 * @param {number} params.maxDistance - Maximum cycling distance budget (km)
 * @param {number} params.routingWeight - Route priority weight 0.5-2.0
 * @param {Array} params.direction - Selected directions ['N', 'S', 'E', 'W']
 * @param {Set} params.visitedSet - Set of "i,j" visited squares
 * @param {number} params.LAT_STEP - Grid cell height (degrees)
 * @param {number} params.LON_STEP - Grid cell width (degrees)
 * @param {number} params.originLat - Grid origin latitude
 * @param {number} params.originLon - Grid origin longitude
 * @param {string} params.optimizationMode - 'balanced', 'edge', or 'holes'
 * @param {number} params.maxHoleSize - Maximum hole size to consider (1-20)
 * @returns {Array} Array of [[lat,lon], [lat,lon]] rectangle bounds in route order
 */
export function optimizeOrienteering(base, params) {
  const {
    maxDistance,
    routingWeight,
    direction,
    visitedSet,
    LAT_STEP,
    LON_STEP,
    originLat,
    originLon,
    optimizationMode,
    maxHoleSize,
    startPoint: userStartPoint
  } = params;

  const size = `${base.maxI - base.minI + 1}×${base.maxJ - base.minJ + 1}`;
  console.log(`\n=== ORIENTEERING OPTIMIZER === Übersquadrat: ${size}, Max Distance: ${maxDistance}km, Routing Weight: ${routingWeight}`);

  // Phase 1: Strategic Analysis (reuse from strategic optimizer)
  const edges = analyzeEdges(base, visitedSet);
  const holes = detectHoles(base, visitedSet, maxHoleSize, LAT_STEP, LON_STEP, originLat, originLon);
  const squareToHoleMap = buildHoleMap(holes);

  // Phase 2: Get starting point
  // Priority: 1) User-selected point, 2) Center of Übersquadrat
  let startPoint;
  if (userStartPoint && userStartPoint.lat && userStartPoint.lon) {
    startPoint = userStartPoint;
    console.log(`Starting from user-selected point: (${startPoint.lat.toFixed(5)}, ${startPoint.lon.toFixed(5)})`);
  } else {
    // Fallback to center of Übersquadrat (not bottom-left)
    const centerI = Math.floor((base.minI + base.maxI) / 2);
    const centerJ = Math.floor((base.minJ + base.maxJ) / 2);
    startPoint = getSquareCenter(centerI, centerJ, originLat, originLon, LAT_STEP, LON_STEP);
    console.log(`No start point selected, using Übersquadrat center: (${startPoint.lat.toFixed(5)}, ${startPoint.lon.toFixed(5)})`);
  }

  // Phase 3: Build route incrementally (CORE ORIENTEERING LOGIC)
  const route = buildOrienteeringRoute({
    base,
    startPoint,
    maxDistance,
    routingWeight,
    edges,
    holes,
    squareToHoleMap,
    direction,
    visitedSet,
    LAT_STEP,
    LON_STEP,
    originLat,
    originLon,
    optimizationMode
  });

  console.log(`Orienteering route: ${route.length} squares, estimated ${route.totalDistance ? route.totalDistance.toFixed(1) : '?'}km`);

  // Convert to rectangle bounds format
  const results = route.map(sq => rectFromIJ(sq.i, sq.j, originLat, originLon, LAT_STEP, LON_STEP));
  return results;
}

/**
 * Build route incrementally using orienteering approach
 *
 * At each step, choose the square that maximizes:
 *   (strategic_value / cycling_distance) * routingWeight + strategic_value * (1 - routingWeight)
 *
 * This balances route efficiency (value per km) with strategic importance.
 */
function buildOrienteeringRoute(params) {
  const route = [];
  let currentPosition = params.startPoint;
  let totalDistance = 0;

  // Create local copy of visitedSet to mark squares as we add them to route
  const localVisitedSet = new Set(params.visitedSet);

  let iteration = 0;
  const maxIterations = 100; // Safety limit to prevent infinite loops

  while (totalDistance < params.maxDistance && iteration < maxIterations) {
    iteration++;

    // Get frontier candidates (Layer 0 unvisited squares)
    // For first iteration, allow larger distance to find initial frontiers
    const frontiers = getFrontierCandidates(params.base, localVisitedSet, currentPosition, params, iteration === 1);

    if (frontiers.length === 0) {
      console.log(`No more frontiers available after ${route.length} squares`);
      break;
    }

    // Score each frontier with route-aware scoring
    const scored = frontiers.map(square => {
      const strategicScore = calculateStrategicScore(square, params, localVisitedSet);
      const cyclingDistance = estimateCyclingDistance(currentPosition, square, params);

      // Orienteering efficiency: strategic value per km
      const efficiency = cyclingDistance > 0 ? strategicScore / cyclingDistance : 0;

      // Combined score balances efficiency and strategic value
      // routingWeight=1.0 means equal balance
      // routingWeight>1.0 favors routing efficiency
      // routingWeight<1.0 favors strategic value
      const normalizedRoutingWeight = Math.min(Math.max(params.routingWeight, 0.5), 2.0);
      const finalScore =
        efficiency * normalizedRoutingWeight * 1000 +
        strategicScore * (2.0 - normalizedRoutingWeight);

      return {
        square,
        strategicScore,
        cyclingDistance,
        efficiency,
        finalScore
      };
    });

    // Select best square
    scored.sort((a, b) => b.finalScore - a.finalScore);
    const best = scored[0];

    // Check distance budget
    if (totalDistance + best.cyclingDistance > params.maxDistance) {
      console.log(`Distance budget exceeded: ${totalDistance.toFixed(1)} + ${best.cyclingDistance.toFixed(1)} > ${params.maxDistance}km`);
      break;
    }

    // Add to route
    route.push(best.square);
    totalDistance += best.cyclingDistance;
    currentPosition = getSquareCenter(
      best.square.i,
      best.square.j,
      params.originLat,
      params.originLon,
      params.LAT_STEP,
      params.LON_STEP
    );

    // Mark as visited for next iteration
    localVisitedSet.add(getSquareKey(best.square.i, best.square.j));

    if (iteration % 5 === 0 || frontiers.length < 10) {
      console.log(`  Iteration ${iteration}: Added (${best.square.i},${best.square.j}), distance: ${totalDistance.toFixed(1)}km, score: ${best.finalScore.toFixed(0)}`);
    }
  }

  route.totalDistance = totalDistance;
  return route;
}

/**
 * Get frontier candidates (Layer 0 unvisited squares near current route)
 */
function getFrontierCandidates(base, visitedSet, currentPosition, params, isFirstIteration = false) {
  const candidates = [];
  const searchBounds = getSearchBounds(base, 3); // Search within 3 layers

  let totalScanned = 0;
  let skippedReasons = {
    visited: 0,
    insideUber: 0,
    tooFarLayer: 0,
    tooFarDistance: 0,
    directionFilter: 0
  };

  for (let i = searchBounds.minI; i <= searchBounds.maxI; i++) {
    for (let j = searchBounds.minJ; j <= searchBounds.maxJ; j++) {
      totalScanned++;
      const key = getSquareKey(i, j);

      // Skip if already visited
      if (visitedSet.has(key)) {
        skippedReasons.visited++;
        continue;
      }

      // Only consider squares OUTSIDE the Übersquadrat
      if (i >= base.minI && i <= base.maxI && j >= base.minJ && j <= base.maxJ) {
        skippedReasons.insideUber++;
        continue;
      }

      // Check if on frontier (Layer 0-2)
      const layerDist = calculateLayerDistance(i, j, base).total;
      if (layerDist > 2) {
        skippedReasons.tooFarLayer++;
        continue;
      }

      // For first iteration, allow larger distance to find initial frontiers
      const maxAllowedDistance = isFirstIteration ? MAX_GAP_DISTANCE * 3 : MAX_GAP_DISTANCE;

      // Check distance from current position
      const distance = estimateCyclingDistance(currentPosition, { i, j }, params);
      if (distance > maxAllowedDistance) {
        skippedReasons.tooFarDistance++;
        continue;
      }

      // Determine edge position
      const positions = {
        N: i > base.maxI,
        S: i < base.minI,
        E: j > base.maxJ,
        W: j < base.minJ
      };
      const edge = Object.keys(positions).filter(k => positions[k]).join('');

      // Direction filter
      if (Array.isArray(params.direction) && params.direction.length < 4) {
        const matchesAnyDirection = params.direction.some(dir => positions[dir]);
        if (!matchesAnyDirection) {
          skippedReasons.directionFilter++;
          continue;
        }
      }

      candidates.push({ i, j, key, edge, layerDist });
    }
  }

  // Debug logging
  if (candidates.length === 0) {
    console.warn(`⚠️ No frontiers found! Scanned ${totalScanned} squares:`, skippedReasons);
    console.warn(`Search bounds: i=[${searchBounds.minI}, ${searchBounds.maxI}], j=[${searchBounds.minJ}, ${searchBounds.maxJ}]`);
    console.warn(`Current position: (${currentPosition.lat.toFixed(5)}, ${currentPosition.lon.toFixed(5)})`);
  }

  return candidates;
}

/**
 * Calculate strategic score for a square (reuses strategic optimizer logic)
 */
function calculateStrategicScore(square, params, localVisitedSet) {
  let score = 100;

  // Layer distance scoring
  const isBorder = isOnUbersquadratBorder(square.i, square.j, params.base);
  const layerDistance = isBorder ? 0 : square.layerDist || calculateLayerDistance(square.i, square.j, params.base).total;

  if (layerDistance === 0) score += 10000;
  else if (layerDistance === 1) score += 5000;
  else if (layerDistance === 2) score += 2000;
  else if (layerDistance === 3) score += 500;
  else score -= 1000; // Penalty for layer 4+

  // Edge completion
  const maxEdgeCompletion = ['N', 'S', 'E', 'W']
    .filter(dir => square.edge && square.edge.includes(dir))
    .reduce((max, dir) => Math.max(max, params.edges[dir].completion), 0);
  let edgeBonus = Math.floor(maxEdgeCompletion * 5);

  // Hole filling
  const squareKey = getSquareKey(square.i, square.j);
  const hole = params.squareToHoleMap.get(squareKey);
  let holeSizeBonus = 0;

  if (hole) {
    let holeMultiplier = 800;
    if (layerDistance >= 3) holeMultiplier = 400;
    holeSizeBonus = hole.size * holeMultiplier;

    const unvisitedInHole = hole.squares.filter(
      sq => !localVisitedSet.has(sq.key) && sq.key !== squareKey
    ).length;
    if (unvisitedInHole === 0) score += 1500;
  }

  // Mode multipliers
  const mult = MODE_MULTIPLIERS[params.optimizationMode] || MODE_MULTIPLIERS.balanced;
  edgeBonus = Math.floor(edgeBonus * mult.edge);
  holeSizeBonus = Math.floor(holeSizeBonus * mult.hole);

  score += edgeBonus + holeSizeBonus;

  // Adjacency bonus (important for continuous routes)
  const adjacency = getNeighborKeys(square.i, square.j).filter(n => localVisitedSet.has(n)).length;
  score += adjacency * 100; // Higher bonus than strategic mode for route continuity

  return score;
}

/**
 * Estimate cycling distance between two points using Turf.js
 *
 * Uses straight-line distance multiplied by a road factor to approximate
 * actual cycling distance without calling expensive routing APIs.
 */
function estimateCyclingDistance(from, square, params) {
  // Convert square to center point if needed
  const toPoint = square.lat
    ? square
    : getSquareCenter(square.i, square.j, params.originLat, params.originLon, params.LAT_STEP, params.LON_STEP);

  // Create turf points (note: turf uses [lon, lat] order)
  const fromTurf = turf.point([from.lon, from.lat]);
  const toTurf = turf.point([toPoint.lon, toPoint.lat]);

  // Calculate straight-line distance
  const straightLine = turf.distance(fromTurf, toTurf, { units: 'kilometers' });

  // Apply road factor (roads rarely go straight)
  return straightLine * ROAD_FACTOR;
}
