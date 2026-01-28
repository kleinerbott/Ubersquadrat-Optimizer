/**
 * TSP (Traveling Salesman Problem) Solver
 * Uses Turf.js for distance calculations and heuristic algorithms for route optimization.
 */

import * as turf from '@turf/turf';

/**
 * Nearest Neighbor algorithm for TSP using Turf.js nearestPoint
 * Greedy approach: always visit the nearest unvisited point
 * @param {Array} points - Array of {lat, lon} points to visit
 * @param {Object} startPoint - Starting point {lat, lon}
 * @param {boolean} roundtrip - Whether to return to start
 * @returns {Array} Ordered array of points
 */
export function nearestNeighbor(points, startPoint, roundtrip = false) {
  if (points.length === 0) return [startPoint];
  if (points.length === 1) {
    return roundtrip ? [startPoint, points[0], startPoint] : [startPoint, points[0]];
  }

  const unvisited = [...points];
  const route = [startPoint];
  let current = turf.point([startPoint.lon, startPoint.lat]);

  while (unvisited.length > 0) {
    // Create feature collection from unvisited points
    const pointsFC = turf.featureCollection(
      unvisited.map((p, idx) => turf.point([p.lon, p.lat], { index: idx }))
    );

    // Use Turf's nearestPoint to find closest unvisited point
    const nearest = turf.nearestPoint(current, pointsFC);
    const nearestIndex = nearest.properties.index;
    const nearestPoint = unvisited[nearestIndex];

    route.push(nearestPoint);
    current = turf.point([nearestPoint.lon, nearestPoint.lat]);
    unvisited.splice(nearestIndex, 1);
  }

  if (roundtrip) {
    route.push(startPoint);
  }

  return route;
}

/**
 * Calculate total route distance using Turf.js
 * @param {Array} route - Ordered array of {lat, lon} points
 * @returns {number} Total distance in kilometers
 */
export function calculateRouteDistance(route) {
  if (route.length < 2) return 0;

  // Create linestring from route points
  const coords = route.map(p => [p.lon, p.lat]);
  const line = turf.lineString(coords);
  return turf.length(line, { units: 'kilometers' });
}

/**
 * Solve TSP using nearest neighbor algorithm with optional 2-opt optimization
 * @param {Array} points - Array of {lat, lon} points to visit
 * @param {Object} startPoint - Starting point {lat, lon}
 * @param {boolean} roundtrip - Whether to return to start
 * @param {boolean} optimize - Whether to apply 2-opt optimization (default: true)
 * @returns {Object} {route: Array, distance: number}
 */
export function solveTSP(points, startPoint, roundtrip = false, optimize = true) {
  let route = nearestNeighbor(points, startPoint, roundtrip);

  if (optimize && points.length >= 3) {
    route = twoOptOptimize(route);
  }
  const dist = calculateRouteDistance(route);

  return { route, distance: dist };
}

/**
 * 2-opt optimization to improve route by removing crossing paths.
 *
 * @param {Array} route - Initial route as array of {lat, lon} points
 * @param {number} maxIterations - Maximum optimization iterations
 * @returns {Array} Optimized route
 */
export function twoOptOptimize(route, maxIterations = 100) {
  if (route.length < 4) return route;

  const initialDistance = calculateRouteDistance(route);
  const optimizedRoute = [...route];
  const n = optimizedRoute.length;
  let improved = true;
  let iterations = 0;
  let totalSwaps = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        const [a, b, c, d] = [optimizedRoute[i - 1], optimizedRoute[i], optimizedRoute[j], optimizedRoute[j + 1]];

        const currentCost =
          turf.distance(turf.point([a.lon, a.lat]), turf.point([b.lon, b.lat])) +
          turf.distance(turf.point([c.lon, c.lat]), turf.point([d.lon, d.lat]));

        const newCost =
          turf.distance(turf.point([a.lon, a.lat]), turf.point([c.lon, c.lat])) +
          turf.distance(turf.point([b.lon, b.lat]), turf.point([d.lon, d.lat]));

        if (newCost < currentCost) {
          // Reverse segment [i..j]
          const reversed = optimizedRoute.slice(i, j + 1).reverse();
          optimizedRoute.splice(i, j - i + 1, ...reversed);
          improved = true;
          totalSwaps++;
        }
      }
    }
  }

  const finalDistance = calculateRouteDistance(optimizedRoute);
  const improvement = ((initialDistance - finalDistance) / initialDistance * 100).toFixed(1);
  console.log(`2-opt: ${iterations} iterations, ${totalSwaps} swaps, ${initialDistance.toFixed(2)} → ${finalDistance.toFixed(2)} km (${improvement}% improvement)`);
  return optimizedRoute;
}

/**
 * Refine waypoint candidates by testing alternatives and swapping if total route improves.
 * Uses TOTAL route distance (not just local prev→current→next) to capture global effects.
 *
 * @param {Array} route - Route array where waypoints may have .alternatives
 * @param {number} maxIterations - Maximum refinement iterations
 * @returns {Object} { route, iterations, swaps, distance }
 */
export function refineCandidates(route, maxIterations = 10) {
  if (route.length < 3) return { route, iterations: 0, swaps: 0, distance: calculateRouteDistance(route) };

  // Count total alternatives available
  const totalAlternatives = route.reduce((sum, wp) => sum + (wp.alternatives?.length || 0), 0);
  const waypointsWithAlts = route.filter(wp => wp.alternatives?.length > 0).length;
  console.log(`Candidate refinement: ${waypointsWithAlts} waypoints with ${totalAlternatives} total alternatives`);

  let improved = true;
  let iterations = 0;
  let totalSwaps = 0;
  let currentDistance = calculateRouteDistance(route);
  const initialDistance = currentDistance;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // Try swapping each waypoint with its alternatives
    for (let i = 1; i < route.length - 1; i++) {
      const wp = route[i];
      if (!wp.alternatives || wp.alternatives.length === 0) continue;

      for (const alt of wp.alternatives) {
        // Create test route with alternative candidate
        const testRoute = route.map((p, idx) => {
          if (idx === i) {
            return { ...p, lat: alt.lat, lon: alt.lon, type: alt.type };
          }
          return p;
        });

        const newDistance = calculateRouteDistance(testRoute);

        // Accept if improvement (with small tolerance to avoid floating point issues)
        if (newDistance < currentDistance - 0.001) {
          // Swap: move current position to alternatives, promote alt to primary
          const oldCandidate = { lat: wp.lat, lon: wp.lon, type: wp.type, priority: wp.priority };
          wp.alternatives = [oldCandidate, ...wp.alternatives.filter(a => a !== alt)];
          wp.lat = alt.lat;
          wp.lon = alt.lon;
          wp.type = alt.type;
          if (alt.priority !== undefined) wp.priority = alt.priority;

          currentDistance = newDistance;
          improved = true;
          totalSwaps++;
          break; // Re-evaluate from start after a swap
        }
      }

      if (improved) break; // Restart outer loop after improvement
    }
  }

  if (totalSwaps > 0) {
    const improvement = ((initialDistance - currentDistance) / initialDistance * 100).toFixed(1);
    console.log(`Candidate refinement: ${iterations} iterations, ${totalSwaps} swaps, ${initialDistance.toFixed(2)} → ${currentDistance.toFixed(2)} km (${improvement}% improvement)`);
  }

  return { route, iterations, swaps: totalSwaps, distance: currentDistance };
}