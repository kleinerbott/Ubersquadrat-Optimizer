/**
 * KML Processing Module
 * Handles parsing and processing of KML files using Turf.js for geometry operations
 */

import * as turf from '@turf/turf';
import { CONFIG } from './config.js';

// ===== GEOMETRY HELPER FUNCTIONS (using Turf.js) =====

/**
 * Calculates bounding box from coordinates
 * @param {Array} coords - Array of [lat, lon] coordinates
 * @returns {Object} {minLat, maxLat, minLon, maxLon}
 */
export function calculateBounds(coords) {
  // Convert [lat, lon] to [lon, lat] for Turf.js
  const turfCoords = coords.map(c => [c[1], c[0]]);
  const line = turf.lineString(turfCoords);
  const [minLon, minLat, maxLon, maxLat] = turf.bbox(line);

  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Checks if point is inside polygon, accounting for holes
 * Uses Turf.js booleanPointInPolygon which handles holes natively
 * @param {number} lat - Latitude of point
 * @param {number} lon - Longitude of point
 * @param {Object} polygon - Polygon object with {outer, holes} structure (coords in [lat, lon])
 * @returns {boolean} True if point is inside polygon and not in any hole
 */
export function isPointInPolygonWithHoles(lat, lon, polygon) {
  // Convert to Turf.js format: [lon, lat] and polygon with holes
  const point = turf.point([lon, lat]);

  // Build polygon coordinates: outer ring + holes, all in [lon, lat] format
  const outerRing = polygon.outer.map(c => [c[1], c[0]]);
  // Close the ring if not already closed
  if (outerRing[0][0] !== outerRing[outerRing.length - 1][0] ||
      outerRing[0][1] !== outerRing[outerRing.length - 1][1]) {
    outerRing.push(outerRing[0]);
  }

  const rings = [outerRing];

  // Add holes
  for (const hole of polygon.holes) {
    const holeRing = hole.map(c => [c[1], c[0]]);
    // Close the hole ring if not already closed
    if (holeRing[0][0] !== holeRing[holeRing.length - 1][0] ||
        holeRing[0][1] !== holeRing[holeRing.length - 1][1]) {
      holeRing.push(holeRing[0]);
    }
    rings.push(holeRing);
  }

  try {
    const turfPolygon = turf.polygon(rings);
    return turf.booleanPointInPolygon(point, turfPolygon);
  } catch (e) {
    // Fallback for invalid polygons
    console.warn('Invalid polygon geometry:', e.message);
    return false;
  }
}

/**
 * Calculate area of a polygon in square meters
 * @param {Array} coords - Array of [lat, lon] coordinates
 * @returns {number} Area in square meters
 */
export function calculateArea(coords) {
  const turfCoords = coords.map(c => [c[1], c[0]]);
  // Close the ring if needed
  if (turfCoords[0][0] !== turfCoords[turfCoords.length - 1][0] ||
      turfCoords[0][1] !== turfCoords[turfCoords.length - 1][1]) {
    turfCoords.push(turfCoords[0]);
  }

  try {
    const polygon = turf.polygon([turfCoords]);
    return turf.area(polygon);
  } catch (e) {
    // Fallback to bounding box area approximation
    const bounds = calculateBounds(coords);
    return (bounds.maxLat - bounds.minLat) * (bounds.maxLon - bounds.minLon);
  }
}

// ===== POLYGON EXTRACTION =====

/**
 * Extracts polygon data from different geometry types
 * @param {Object} geometry - GeoJSON geometry object
 * @returns {Array} Array of polygons with {outer, holes} structure
 */
export function extractPolygons(geometry) {
  const polygons = [];

  if (geometry.type === 'Polygon') {
    polygons.push({
      outer: geometry.coordinates[0],
      holes: geometry.coordinates.slice(1)
    });
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach(polyCoords => {
      polygons.push({
        outer: polyCoords[0],
        holes: polyCoords.slice(1)
      });
    });
  } else if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach(geom => {
      polygons.push(...extractPolygons(geom));
    });
  }

  return polygons;
}

// ===== KML PROCESSING FUNCTIONS =====

/**
 * Parse KML layer and extract features, polygons, and ubersquadrat candidates
 * @param {Object} layer - Leaflet KML layer
 * @returns {Object} {features, allPolygons, candidates}
 */
export function parseKmlFeatures(layer) {
  const features = [];
  const allPolygons = [];
  const candidates = [];

  layer.eachLayer(featureLayer => {
    if (featureLayer.setStyle) {
      featureLayer.setStyle({
        fillColor: CONFIG.VISITED_COLOR,
        color: CONFIG.VISITED_BORDER_COLOR,
        fillOpacity: 0.3
      });
    }

    const featureName = featureLayer.feature?.properties?.name?.toLowerCase() || '';
    const isUbersquadrat = featureName.includes('ubersquadrat') && !featureName.includes('ubersquadratinho');
    const isUbersquadratinho = featureName.includes('ubersquadratinho') || featureName.includes('squadratinho');

    if (isUbersquadratinho) return;

    if (featureLayer.feature?.geometry) {
      const geometry = featureLayer.feature.geometry;
      if (geometry.type === 'Point') return;

      const polygonsToProcess = extractPolygons(geometry);
      if (polygonsToProcess.length === 0) return;

      polygonsToProcess.forEach(polyData => {
        // Convert [lon, lat] → [lat, lon]
        const outerLatLon = polyData.outer.map(c => [c[1], c[0]]);
        const holesLatLon = polyData.holes.map(hole => hole.map(c => [c[1], c[0]]));

        allPolygons.push({ outer: outerLatLon, holes: holesLatLon });

        if (isUbersquadrat) {
          candidates.push({
            name: featureLayer.feature.properties.name,
            coords: outerLatLon,
            size: parseInt(featureLayer.feature.properties.size) || 16
          });
        } else {
          features.push({ outer: outerLatLon, holes: holesLatLon });
        }
      });
    }
  });

  return { features, allPolygons, candidates };
}

/**
 * Find the ubersquadrat from candidates or fall back to largest feature
 * Uses Turf.js area calculation for accurate comparison
 * @param {Array} candidates - Array of ubersquadrat candidates
 * @param {Array} features - Array of regular features (fallback)
 * @returns {Object} {coords, size}
 */
export function findUbersquadrat(candidates, features) {
  let uberCoords = null;
  let uberSize = 16;

  if (candidates.length > 0) {
    let maxArea = 0;
    for (const candidate of candidates) {
      const area = calculateArea(candidate.coords);
      if (area > maxArea) {
        maxArea = area;
        uberCoords = candidate.coords;
        uberSize = candidate.size;
      }
    }
  } else {
    let maxArea = 0;
    for (const feature of features) {
      const area = calculateArea(feature.outer);
      if (area > maxArea) {
        maxArea = area;
        uberCoords = feature.outer;
      }
    }
  }

  return { coords: uberCoords, size: uberSize };
}
