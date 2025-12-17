/**
 * Waypoint Optimizer Module
 * Finds optimal waypoints on roads within squares using Turf.js
 */

import * as turf from '@turf/turf';

/**
 * Create a Turf.js polygon from square bounds
 * @param {Object} square - Square with bounds {north, south, east, west} or [[s,w],[n,e]]
 * @returns {Feature<Polygon>}
 */
function squareToPolygon(square) {
  let bounds;

  // Handle different square formats
  if (Array.isArray(square)) {
    // Format: [[south, west], [north, east]]
    bounds = {
      south: square[0][0],
      west: square[0][1],
      north: square[1][0],
      east: square[1][1]
    };
  } else if (square.bounds) {
    bounds = square.bounds;
  } else {
    bounds = square;
  }

  return turf.bboxPolygon([bounds.west, bounds.south, bounds.east, bounds.north]);
}

/**
 * Get center point of a square using Turf.js
 * @param {Object} square
 * @returns {{lat: number, lon: number}}
 */
function getSquareCenter(square) {
  const polygon = squareToPolygon(square);
  const center = turf.center(polygon);
  const coords = center.geometry.coordinates;

  return {
    lat: coords[1],
    lon: coords[0]
  };
}

/**
 * Find roads that pass through a square
 * @param {Array} roads - Array of GeoJSON road features
 * @param {Object} square - Square bounds
 * @returns {Array} Roads that intersect the square
 */
function findRoadsInSquare(roads, square) {
  const squarePoly = squareToPolygon(square);
  const intersectingRoads = [];

  for (const road of roads) {
    try {
      // Check if road intersects square
      if (turf.booleanIntersects(road, squarePoly)) {
        // Clip road to square bounds
        const clipped = turf.bboxClip(road, turf.bbox(squarePoly));

        if (clipped.geometry.coordinates.length > 0) {
          intersectingRoads.push({
            original: road,
            clipped: clipped
          });
        }
      }
    } catch (e) {
      // Skip invalid geometries
      console.warn('Invalid road geometry:', e.message);
    }
  }

  return intersectingRoads;
}

/**
 * Find the best waypoint on roads within a square
 * Prefers: road intersections > road midpoints > any point on road
 * @param {Array} roadsInSquare - Roads clipped to square
 * @param {Object} square - Square bounds
 * @returns {{lat: number, lon: number} | null}
 */
function findBestWaypointOnRoads(roadsInSquare, square) {
  if (roadsInSquare.length === 0) {
    return null;
  }

  const squareCenter = getSquareCenter(square);
  const centerPoint = turf.point([squareCenter.lon, squareCenter.lat]);

  // Collect candidate points
  const candidates = [];

  // Strategy 1: Find intersections between roads (best waypoints)
  if (roadsInSquare.length > 1) {
    for (let i = 0; i < roadsInSquare.length; i++) {
      for (let j = i + 1; j < roadsInSquare.length; j++) {
        try {
          const intersections = turf.lineIntersect(
            roadsInSquare[i].clipped,
            roadsInSquare[j].clipped
          );

          if (intersections.features.length > 0) {
            intersections.features.forEach(pt => {
              candidates.push({
                point: pt,
                priority: 3, // Highest priority for intersections
                type: 'intersection'
              });
            });
          }
        } catch (e) {
          // Skip invalid intersections
        }
      }
    }
  }

  // Strategy 2: Midpoints of road segments within square
  for (const road of roadsInSquare) {
    try {
      const coords = road.clipped.geometry.coordinates;
      if (coords.length >= 2) {
        // Get midpoint of the clipped segment
        const midpoint = turf.midpoint(
          turf.point(coords[0]),
          turf.point(coords[coords.length - 1])
        );
        candidates.push({
          point: midpoint,
          priority: 2,
          type: 'midpoint'
        });
      }
    } catch (e) {
      // Skip invalid geometries
    }
  }

  // Strategy 3: Point on road closest to square center
  for (const road of roadsInSquare) {
    try {
      const nearestPoint = turf.nearestPointOnLine(road.clipped, centerPoint);
      candidates.push({
        point: nearestPoint,
        priority: 1,
        type: 'nearest'
      });
    } catch (e) {
      // Skip invalid geometries
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort by priority (descending), then by distance to center (ascending)
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    const distA = turf.distance(a.point, centerPoint);
    const distB = turf.distance(b.point, centerPoint);
    return distA - distB;
  });

  // Return best candidate
  const best = candidates[0];
  const coords = best.point.geometry.coordinates;

  return {
    lat: coords[1],
    lon: coords[0],
    type: best.type
  };
}

/**
 * Optimize waypoints for a list of squares using road data
 * @param {Array} squares - Array of square bounds (from optimizer)
 * @param {Array} roads - Array of GeoJSON road features
 * @returns {Object} Result with optimized waypoints and statistics
 */
export function optimizeWaypoints(squares, roads) {
  const results = {
    waypoints: [],
    skippedSquares: [],
    statistics: {
      total: squares.length,
      withRoads: 0,
      withoutRoads: 0,
      intersections: 0,
      midpoints: 0,
      nearest: 0
    }
  };

  for (let i = 0; i < squares.length; i++) {
    const square = squares[i];
    const roadsInSquare = findRoadsInSquare(roads, square);

    if (roadsInSquare.length > 0) {
      const waypoint = findBestWaypointOnRoads(roadsInSquare, square);

      if (waypoint) {
        results.waypoints.push({
          ...waypoint,
          squareIndex: i,
          hasRoad: true
        });
        results.statistics.withRoads++;

        // Track waypoint type statistics
        if (waypoint.type === 'intersection') results.statistics.intersections++;
        else if (waypoint.type === 'midpoint') results.statistics.midpoints++;
        else results.statistics.nearest++;
      } else {
        // Fallback to center
        const center = getSquareCenter(square);
        results.waypoints.push({
          ...center,
          squareIndex: i,
          hasRoad: false,
          type: 'center-fallback'
        });
        results.statistics.withoutRoads++;
        results.skippedSquares.push(i);
      }
    } else {
      // No roads in square - use center as fallback but flag it
      const center = getSquareCenter(square);
      results.waypoints.push({
        ...center,
        squareIndex: i,
        hasRoad: false,
        type: 'no-road'
      });
      results.statistics.withoutRoads++;
      results.skippedSquares.push(i);
    }
  }

  console.log(`Waypoint optimization: ${results.statistics.withRoads}/${results.statistics.total} squares have roads`);
  console.log(`Waypoint types: ${results.statistics.intersections} intersections, ${results.statistics.midpoints} midpoints, ${results.statistics.nearest} nearest points`);

  if (results.skippedSquares.length > 0) {
    console.warn(`${results.skippedSquares.length} squares have no suitable roads - using center points as fallback`);
  }

  return results;
}

/**
 * Calculate bounds that encompass all squares using Turf.js
 * @param {Array} squares - Array of square bounds
 * @returns {Object} Combined bounds
 */
export function calculateCombinedBounds(squares) {
  // Convert all squares to polygons and create a FeatureCollection
  const polygons = squares.map(square => squareToPolygon(square));
  const featureCollection = turf.featureCollection(polygons);

  // Use Turf.js to calculate bounding box
  const [minLon, minLat, maxLon, maxLat] = turf.bbox(featureCollection);

  return { minLat, maxLat, minLon, maxLon };
}
