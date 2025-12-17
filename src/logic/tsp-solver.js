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
 * 2-opt optimization to improve route
 * Tries to remove crossing paths by reversing segments
 * @param {Array} route - Initial route
 * @param {number} maxIterations - Maximum optimization iterations
 * @returns {Array} Optimized route
 */
export function twoOptOptimize(route, maxIterations = 100) {
  if (route.length < 4) return route;

  let improved = true;
  let iterations = 0;
  let currentRoute = [...route];
  let currentDistance = calculateRouteDistance(currentRoute);

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < currentRoute.length - 2; i++) {
      for (let j = i + 1; j < currentRoute.length - 1; j++) {
        const newRoute = [
          ...currentRoute.slice(0, i),
          ...currentRoute.slice(i, j + 1).reverse(),
          ...currentRoute.slice(j + 1)
        ];

        const newDistance = calculateRouteDistance(newRoute);

        if (newDistance < currentDistance) {
          currentRoute = newRoute;
          currentDistance = newDistance;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  console.log(`2-opt: ${iterations} iterations, ${currentDistance.toFixed(2)} km`);
  return currentRoute;
}

/**
 * Solve TSP using nearest neighbor with optional 2-opt optimization
 * @param {Array} points - Array of {lat, lon} points to visit
 * @param {Object} startPoint - Starting point {lat, lon}
 * @param {boolean} roundtrip - Whether to return to start
 * @param {boolean} optimize - Whether to apply 2-opt optimization
 * @returns {Object} {route: Array, distance: number}
 */
export function solveTSP(points, startPoint, roundtrip = false, optimize = true) {
  console.log(`TSP: ${points.length} points, roundtrip=${roundtrip}`);

  let route = nearestNeighbor(points, startPoint, roundtrip);

  if (optimize && points.length >= 3) {
    route = twoOptOptimize(route);
  }

  const dist = calculateRouteDistance(route);
  console.log(`TSP solved: ${route.length} waypoints, ${dist.toFixed(2)} km`);

  return { route, distance: dist };
}
