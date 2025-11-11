/**
 * TSP (Traveling Salesman Problem) Solver
 *
 * Implements heuristic algorithms to find efficient routes through proposed squares.
 * Uses nearest-neighbor and optional 2-opt optimization.
 */

/**
 * Calculate Euclidean distance between two points
 * @param {Object} p1 - Point with {lat, lon}
 * @param {Object} p2 - Point with {lat, lon}
 * @returns {number} Distance in degrees (approximate)
 */
function euclideanDistance(p1, p2) {
  const dLat = p1.lat - p2.lat;
  const dLon = p1.lon - p2.lon;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Calculate Haversine distance between two points (more accurate for lat/lon)
 * @param {Object} p1 - Point with {lat, lon}
 * @param {Object} p2 - Point with {lat, lon}
 * @returns {number} Distance in kilometers
 */
function haversineDistance(p1, p2) {
  const R = 6371; // Earth's radius in km
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lon - p1.lon) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Nearest Neighbor algorithm for TSP
 * Greedy approach: always visit the nearest unvisited point
 *
 * @param {Array} points - Array of {lat, lon} points to visit
 * @param {Object} startPoint - Starting point {lat, lon}
 * @param {boolean} roundtrip - Whether to return to start
 * @returns {Array} Ordered array of points (including start point)
 */
export function nearestNeighbor(points, startPoint, roundtrip = false) {
  if (points.length === 0) return [startPoint];
  if (points.length === 1) {
    return roundtrip ? [startPoint, points[0], startPoint] : [startPoint, points[0]];
  }

  const unvisited = [...points];
  const route = [startPoint];
  let current = startPoint;

  // Visit all points
  while (unvisited.length > 0) {
    // Find nearest unvisited point
    let nearestIndex = 0;
    let minDistance = haversineDistance(current, unvisited[0]);

    for (let i = 1; i < unvisited.length; i++) {
      const dist = haversineDistance(current, unvisited[i]);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = i;
      }
    }

    // Add nearest point to route
    const nearest = unvisited[nearestIndex];
    route.push(nearest);
    current = nearest;

    // Remove from unvisited
    unvisited.splice(nearestIndex, 1);
  }

  // Add return to start if roundtrip
  if (roundtrip) {
    route.push(startPoint);
  }

  return route;
}

/**
 * Calculate total route distance
 * @param {Array} route - Ordered array of {lat, lon} points
 * @returns {number} Total distance in kilometers
 */
export function calculateRouteDistance(route) {
  if (route.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < route.length - 1; i++) {
    totalDistance += haversineDistance(route[i], route[i + 1]);
  }

  return totalDistance;
}

/**
 * 2-opt optimization to improve route
 * Tries to remove crossing paths by reversing segments
 *
 * @param {Array} route - Initial route (including start/end)
 * @param {number} maxIterations - Maximum optimization iterations
 * @returns {Array} Optimized route
 */
export function twoOptOptimize(route, maxIterations = 100) {
  if (route.length < 4) return route; // Need at least 4 points for 2-opt

  let improved = true;
  let iterations = 0;
  let currentRoute = [...route];
  let currentDistance = calculateRouteDistance(currentRoute);

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // Try all possible segment reversals
    for (let i = 1; i < currentRoute.length - 2; i++) {
      for (let j = i + 1; j < currentRoute.length - 1; j++) {
        // Create new route with reversed segment [i...j]
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

  console.log(`2-opt optimization: ${iterations} iterations, distance reduced to ${currentDistance.toFixed(2)} km`);
  return currentRoute;
}

/**
 * Solve TSP using nearest neighbor with optional 2-opt optimization
 *
 * @param {Array} points - Array of {lat, lon} points to visit
 * @param {Object} startPoint - Starting point {lat, lon}
 * @param {boolean} roundtrip - Whether to return to start
 * @param {boolean} optimize - Whether to apply 2-opt optimization
 * @returns {Object} {route: Array, distance: number}
 */
export function solveTSP(points, startPoint, roundtrip = false, optimize = true) {
  console.log(`Solving TSP for ${points.length} points, roundtrip=${roundtrip}, optimize=${optimize}`);

  // Get initial route using nearest neighbor
  let route = nearestNeighbor(points, startPoint, roundtrip);

  // Apply 2-opt optimization if requested
  if (optimize && points.length >= 3) {
    route = twoOptOptimize(route);
  }

  const distance = calculateRouteDistance(route);

  console.log(`TSP solved: ${route.length} waypoints, ${distance.toFixed(2)} km total distance`);

  return {
    route,
    distance
  };
}
