import * as turf from '@turf/turf';
import { normalizeBounds, combineBounds, boundsToMinMax, getBoundsCenter } from './bounds-utils.js';
import { CONFIG } from './config.js';

/**
 * Create a Turf.js polygon from square bounds
 * @param {Object} square - Square with bounds {north, south, east, west} or [[s,w],[n,e]]
 * @returns {Feature<Polygon>}
 */
function squareToPolygon(square) {
  const bounds = normalizeBounds(square);
  return turf.bboxPolygon([bounds.west, bounds.south, bounds.east, bounds.north]);
}

/**
 * Create fallback waypoint at square center
 */
function createFallbackWaypoint(square, index, type = 'no-road') {
  const center = getBoundsCenter(square);
  return {
    ...center,
    squareIndex: index,
    gridCoords: square?.gridCoords,
    hasRoad: false,
    type
  };
}

/**
 * Format candidate as waypoint object
 */
function formatCandidate(candidate) {
  return {
    lat: candidate.point.geometry.coordinates[1],
    lon: candidate.point.geometry.coordinates[0],
    type: candidate.type,
    priority: candidate.priority,
    isConnecting: candidate.isConnecting || false
  };
}


/**
 * Find roads that pass through a square
 * @param {Array} roads - Array of GeoJSON road features
 * @param {Object} square - Square bounds
 * @returns {Array} Roads that intersect the square (with original and clipped geometries)
 */
function findRoadsInSquare(roads, square) {
  const squarePoly = squareToPolygon(square);
  const intersectingRoads = [];

  for (const road of roads) {
    try {
      if (turf.booleanIntersects(road, squarePoly)) {
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
    }
  }

  return intersectingRoads;
}

/**
 * Check if a road connects to the next square
 * @param {Object} road - Road feature (with original geometry)
 * @param {Object} nextSquare - Next square bounds
 * @returns {boolean} True if road intersects next square
 */
function roadConnectsToNextSquare(road, nextSquare) {
  if (!nextSquare || !nextSquare.bounds) {
    return false;
  }

  try {
    const nextSquarePoly = squareToPolygon(nextSquare);
    return turf.booleanIntersects(road.original, nextSquarePoly);
  } catch (e) {
    return false;
  }
}

/**
 * Find roads that connect current square to next square
 * @param {Array} roadsInSquare - Roads in current square
 * @param {Object} nextSquare - Next square bounds
 * @returns {Set} Set of road indices that connect to next square
 */
function findConnectingRoads(roadsInSquare, nextSquare) {
  const connectingIndices = new Set();

  if (!nextSquare || !nextSquare.bounds) {
    return connectingIndices;
  }

  for (let i = 0; i < roadsInSquare.length; i++) {
    if (roadConnectsToNextSquare(roadsInSquare[i], nextSquare)) {
      connectingIndices.add(i);
    }
  }

  return connectingIndices;
}

/**
 * Collect all candidate waypoints for a square using 3 strategies
 * @param {Array} roadsInSquare - Roads in the square (with original and clipped geometry)
 * @param {Object} square - Square bounds
 * @param {Set} connectingRoads - Indices of roads connecting to next square
 * @returns {Array} Candidates {point, priority, type, isConnecting}
 */
function collectCandidates(roadsInSquare, square, connectingRoads = new Set()) {
  const candidates = [];
  const squareCenter = getBoundsCenter(square);
  const centerPoint = turf.point([squareCenter.lon, squareCenter.lat]);

  // Strategy 1: Find intersections between roads (highest priority)
  if (roadsInSquare.length > 1) {
    for (let i = 0; i < roadsInSquare.length; i++) {
      for (let j = i + 1; j < roadsInSquare.length; j++) {
        try {
          const intersections = turf.lineIntersect(
            roadsInSquare[i].clipped,
            roadsInSquare[j].clipped
          );

          if (intersections.features.length > 0) {
            const isConnecting = connectingRoads.has(i) || connectingRoads.has(j);

            intersections.features.forEach(pt => {
              candidates.push({
                point: pt,
                priority: isConnecting ? 5 : 3, 
                type: isConnecting ? 'intersection-connecting' : 'intersection',
                isConnecting
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
  for (let i = 0; i < roadsInSquare.length; i++) {
    try {
      const coords = roadsInSquare[i].clipped.geometry.coordinates;
      if (coords.length >= 2) {
        const isConnecting = connectingRoads.has(i);
        const midpoint = turf.midpoint(
          turf.point(coords[0]),
          turf.point(coords[coords.length - 1])
        );

        candidates.push({
          point: midpoint,
          priority: isConnecting ? 4 : 2,
          type: isConnecting ? 'midpoint-connecting' : 'midpoint',
          isConnecting
        });
      }
    } catch (e) {
      // Skip invalid geometries
    }
  }

  // Strategy 3: Point on road closest to square center (or reference point)
  for (let i = 0; i < roadsInSquare.length; i++) {
    try {
      const isConnecting = connectingRoads.has(i);
      const nearestPoint = turf.nearestPointOnLine(roadsInSquare[i].clipped, centerPoint);

      candidates.push({
        point: nearestPoint,
        priority: isConnecting ? 3.5 : 1,
        type: isConnecting ? 'nearest-connecting' : 'nearest',
        isConnecting
      });
    } catch (e) {
      // Skip invalid geometries
    }
  }

  return candidates;
}

/**
 * Sort candidates by priority and distance metric
 * @param {Array} candidates - Candidate waypoints
 * @param {Object|null} prevPoint - Previous point {lat, lon} for distance calculation
 * @param {Object|null} nextPoint - Next point {lat, lon} for distance calculation
 * @param {Object} squareCenter - Fallback reference point {lon, lat} as Turf point
 */
function sortCandidates(candidates, prevPoint, nextPoint, squareCenter) {
  candidates.sort((a, b) => {
    // Primary sort: Priority (descending)
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    // Secondary sort: Distance metric
    const aPoint = turf.point([a.point.geometry.coordinates[0], a.point.geometry.coordinates[1]]);
    const bPoint = turf.point([b.point.geometry.coordinates[0], b.point.geometry.coordinates[1]]);

    // If we have neighbor points, use sum of distances to prev+next
    if (prevPoint || nextPoint) {
      let distA = 0;
      let distB = 0;

      if (prevPoint) {
        const prevTurf = turf.point([prevPoint.lon, prevPoint.lat]);
        distA += turf.distance(aPoint, prevTurf);
        distB += turf.distance(bPoint, prevTurf);
      }

      if (nextPoint) {
        const nextTurf = turf.point([nextPoint.lon, nextPoint.lat]);
        distA += turf.distance(aPoint, nextTurf);
        distB += turf.distance(bPoint, nextTurf);
      }

      return distA - distB;  // Lower total distance wins
    }

    // Fallback: Distance to square center
    return turf.distance(aPoint, squareCenter) - turf.distance(bPoint, squareCenter);
  });
}

/**
 * Log candidates for debugging (grouped by type)
 * @param {Array} candidates - Sorted candidates
 * @param {Object} square - Square with gridCoords
 * @param {number} squareIndex - Square index
 * @param {number} roadsCount - Number of roads in square
 */
function logCandidates(candidates, square, squareIndex, roadsCount) {
  const gridStr = square.gridCoords ? `(${square.gridCoords.i},${square.gridCoords.j})` : `#${squareIndex}`;
  console.group(`[Waypoint] Square ${gridStr}: ${candidates.length} candidates, ${roadsCount} roads`);

  // Group by type
  const byType = {};
  candidates.forEach((c, idx) => {
    if (!byType[c.type]) byType[c.type] = [];
    byType[c.type].push({ idx, c });
  });

  for (const [type, items] of Object.entries(byType)) {
    const coords = items.map(({ idx, c }) => {
      const lat = c.point.geometry.coordinates[1].toFixed(5);
      const lon = c.point.geometry.coordinates[0].toFixed(5);
      const selected = idx === 0 ? ' ✓' : '';
      return `[${idx}] ${lat},${lon} (p${c.priority})${selected}`;
    }).join(' | ');
    console.log(`  ${type}: ${coords}`);
  }
  console.groupEnd();
}


/**
 * Find best waypoint(s) on roads within a square
 *
 * @param {Array} roadsInSquare - Roads in the square
 * @param {Object} square - Square bounds
 * @param {Object} options - Options object
 * @param {Object|null} options.prevPoint - Previous waypoint {lat, lon} (for sequence-aware)
 * @param {Object|null} options.nextPoint - Next waypoint/square center {lat, lon} (for sequence-aware)
 * @param {Object|null} options.nextSquare - Next square object with bounds (for connecting road detection)
 * @param {boolean} options.returnAlternatives - Return top 3 candidates (for refinement)
 * @param {number} options.squareIndex - Square index (for debug logging)
 * @returns {Object|Array|null} Single waypoint, array of waypoints, or null
 */
function findBestWaypoint(roadsInSquare, square, options = {}) {
  const {
    prevPoint = null,
    nextPoint = null,
    nextSquare = null,
    returnAlternatives = false,
    squareIndex = -1
  } = options;

  if (roadsInSquare.length === 0) {
    return null;
  }

  const squareCenter = getBoundsCenter(square);
  const centerPoint = turf.point([squareCenter.lon, squareCenter.lat]);

  const connectingRoads = nextSquare ? findConnectingRoads(roadsInSquare, nextSquare) : new Set();

  const candidates = collectCandidates(roadsInSquare, square, connectingRoads);

  if (candidates.length === 0) {
    return null;
  }

  sortCandidates(candidates, prevPoint, nextPoint, centerPoint);

  if (CONFIG.DEBUG_WAYPOINT_CANDIDATES) {
    logCandidates(candidates, square, squareIndex, roadsInSquare.length);
  }

  if (returnAlternatives) {
    return candidates.slice(0, 3).map(formatCandidate);
  }

  // Return single best candidate
  return formatCandidate(candidates[0]);
}

/**
 * Optimize waypoints for a list of squares using road data 
 * Neutral optimization - does not consider route sequence
 * Used to find initial waypoints for TSP ordering
 *
 * @param {Array} squares - Array of square bounds (from optimizer)
 * @param {Array} roads - Array of GeoJSON road features
 * @returns {Object} {waypoints, skippedSquares, statistics}
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
      const waypoint = findBestWaypoint(roadsInSquare, square, { squareIndex: i });

      if (waypoint) {
        results.waypoints.push({
          ...waypoint,
          squareIndex: i,
          gridCoords: square.gridCoords,
          hasRoad: true
        });
        results.statistics.withRoads++;

        // Track type statistics
        if (waypoint.type === 'intersection' || waypoint.type === 'intersection-connecting') {
          results.statistics.intersections++;
        } else if (waypoint.type === 'midpoint' || waypoint.type === 'midpoint-connecting') {
          results.statistics.midpoints++;
        } else {
          results.statistics.nearest++;
        }
      } else {
        // Fallback to center
        results.waypoints.push(createFallbackWaypoint(square, i, 'center-fallback'));
        results.statistics.withoutRoads++;
        results.skippedSquares.push(i);
      }
    } else {
      // No roads in square
      results.waypoints.push(createFallbackWaypoint(square, i, 'no-road'));
      results.statistics.withoutRoads++;
      results.skippedSquares.push(i);
    }
  }

  return results;
}

/**
 * Optimize waypoints considering the route sequence (Phase 2)
 * Sequence-aware optimization - considers previous and next squares in route
 * Used after TSP has determined the final visit order
 *
 * @param {Array} orderedSquares - Squares in TSP visit order (with lat, lon, bounds)
 * @param {Array} roads - Array of GeoJSON road features
 * @param {Object|null} startPoint - Starting point {lat, lon}
 * @param {boolean} roundtrip - Whether this is a roundtrip route
 * @returns {Object} {waypoints, skippedSquares, statistics}
 */
export function optimizeWaypointsWithSequence(orderedSquares, roads, startPoint = null, roundtrip = false) {
  const results = {
    waypoints: [],
    skippedSquares: [],
    statistics: {
      total: orderedSquares.length,
      withRoads: 0,
      withoutRoads: 0,
      intersections: 0,
      midpoints: 0,
      nearest: 0,
      sequenceOptimized: 0,
      connectingRoads: 0
    }
  };

  for (let i = 0; i < orderedSquares.length; i++) {
    const square = orderedSquares[i];

    if (!square || !square.bounds) {
      console.warn(`[WaypointOptimizer] Square ${i} has no bounds:`, square);
      results.waypoints.push(createFallbackWaypoint(square || {}, i, 'no-bounds'));
      results.statistics.withoutRoads++;
      results.skippedSquares.push(i);
      continue;
    }

    const roadsInSquare = findRoadsInSquare(roads, square);

    let prevPoint = null;
    let nextPoint = null;
    let nextSquare = null;

    if (i === 0) {
      prevPoint = startPoint;
    } else if (results.waypoints.length > 0) {
      const prevWaypoint = results.waypoints[results.waypoints.length - 1];
      prevPoint = { lat: prevWaypoint.lat, lon: prevWaypoint.lon };
    }

    if (i === orderedSquares.length - 1) {
      if (roundtrip && startPoint) {
        nextPoint = startPoint;
      }
    } else {
      nextSquare = orderedSquares[i + 1];
      nextPoint = getBoundsCenter(nextSquare);
    }

    if (roadsInSquare.length > 0) {
      const candidates = findBestWaypoint(roadsInSquare, square, {
        prevPoint,
        nextPoint,
        nextSquare,
        returnAlternatives: true, 
        squareIndex: i
      });

      if (candidates && candidates.length > 0) {
        const primary = candidates[0];
        const alternatives = candidates.slice(1);

        results.waypoints.push({
          ...primary,
          squareIndex: i,
          gridCoords: square.gridCoords,
          hasRoad: true,
          alternatives  // Store for refineCandidates in tsp-solver
        });
        results.statistics.withRoads++;

        // Track statistics
        if (primary.type === 'intersection' || primary.type === 'intersection-connecting') {
          results.statistics.intersections++;
        } else if (primary.type === 'midpoint' || primary.type === 'midpoint-connecting') {
          results.statistics.midpoints++;
        } else {
          results.statistics.nearest++;
        }

        if (prevPoint || nextPoint) {
          results.statistics.sequenceOptimized++;
        }

        if (primary.isConnecting) {
          results.statistics.connectingRoads++;
        }
      } else {
        // Fallback to center
        results.waypoints.push(createFallbackWaypoint(square, i, 'center-fallback'));
        results.statistics.withoutRoads++;
        results.skippedSquares.push(i);
      }
    } else {
      // No roads in square
      results.waypoints.push(createFallbackWaypoint(square, i, 'no-road'));
      results.statistics.withoutRoads++;
      results.skippedSquares.push(i);
    }
  }

  // Log summary statistics
  console.log(`[WaypointOptimizer] Optimization complete:`);
  console.log(`  - ${results.statistics.connectingRoads}/${results.statistics.total} waypoints on connecting roads`);
  console.log(`  - ${results.statistics.intersections} intersections, ${results.statistics.midpoints} midpoints, ${results.statistics.nearest} nearest points`);
  console.log(`  - ${results.statistics.withRoads} with roads, ${results.statistics.withoutRoads} fallback to center`);

  // Debug: Summary table of all waypoints
  if (CONFIG.DEBUG_WAYPOINT_CANDIDATES) {
    console.group('[WaypointOptimizer] Final waypoint selection:');
    console.table(results.waypoints.map((wp, idx) => ({
      '#': idx,
      grid: wp.gridCoords ? `(${wp.gridCoords.i},${wp.gridCoords.j})` : '-',
      type: wp.type,
      priority: wp.priority || '-',
      connecting: wp.isConnecting ? '✓' : '',
      alternatives: wp.alternatives?.length || 0,
      lat: wp.lat.toFixed(5),
      lon: wp.lon.toFixed(5)
    })));
    console.groupEnd();
  }

  return results;
}

/**
 * Calculate bounds that encompass all squares
 * @param {Array} squares - Array of square bounds
 * @returns {Object} Combined bounds {minLat, maxLat, minLon, maxLon}
 */
export function calculateCombinedBounds(squares) {
  return boundsToMinMax(combineBounds(squares));
}
