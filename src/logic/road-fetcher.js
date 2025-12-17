/**
 * Road Fetcher Module
 * Fetches road data from Overpass API with bike-type specific filters
 */

// Road filters for different bike types
// Excludes highways, motorways, and bike-inappropriate roads
const ROAD_FILTERS = {
  // Road bike - paved roads only, very restrictive
  fastbike: {
    highways: 'primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|living_street',
    excludeSurfaces: 'gravel|unpaved|dirt|grass|sand|mud|ground|earth|compacted|fine_gravel|pebblestone|wood|metal|cobblestone',
    allowedSurfaces: 'paved|asphalt|concrete',
    excludeHighways: 'track|path|footway|bridleway|steps',
    description: 'Paved roads only - suitable for road bikes'
  },

  // Gravel bike - includes unpaved roads and tracks
  gravel: {
    highways: 'primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|cycleway|service|track|path|bridleway',
    excludeSurfaces: 'mud|sand',
    description: 'Paved and unpaved roads suitable for gravel bikes'
  },

  // Trekking/touring - general cycling, avoids difficult terrain
  trekking: {
    highways: 'primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|cycleway|service|track|path',
    excludeSurfaces: 'mud|sand|grass',
    description: 'General cycling roads and paths'
  }
};

/**
 * Build Overpass query for roads in a bounding box
 * @param {Object} bounds - {south, west, north, east}
 * @param {string} bikeType - 'fastbike', 'gravel', or 'trekking'
 * @returns {string} Overpass QL query
 */
function buildOverpassQuery(bounds, bikeType) {
  const filter = ROAD_FILTERS[bikeType] || ROAD_FILTERS.trekking;
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;

  // For fastbike, use a more restrictive query with positive surface filter
  if (bikeType === 'fastbike') {
    // Query for roads with explicitly paved surfaces OR major roads
    const query = `
[out:json][timeout:30];
(
  // Roads with paved surfaces
  way["highway"~"^(${filter.highways})$"]
     ["surface"~"^(${filter.allowedSurfaces})$"]
     ["bicycle"!="no"]
     ["access"!="private"]
     ["motor_vehicle"!="designated"]
     (${bbox});

  // Major roads (primary/secondary) without bad surface tags (assumed paved)
  way["highway"~"^(primary|primary_link|secondary|secondary_link|tertiary|tertiary_link)$"]
     ["bicycle"!="no"]
     ["access"!="private"]
     ["motor_vehicle"!="designated"]
     ["surface"!~"^(${filter.excludeSurfaces})$"]
     ${filter.excludeHighways ? `["highway"!~"^(${filter.excludeHighways})$"]` : ''}
     (${bbox});
);
out body geom;
`;
    return query;
  }

  // Build the query with bike-type specific filters (for gravel/trekking)
  const query = `
[out:json][timeout:30];
(
  way["highway"~"^(${filter.highways})$"]
     ["bicycle"!="no"]
     ["access"!="private"]
     ["motor_vehicle"!="designated"]
     ${filter.excludeSurfaces ? `["surface"!~"^(${filter.excludeSurfaces})$"]` : ''}
     (${bbox});
);
out body geom;
`;

  return query;
}

/**
 * Convert Overpass response to GeoJSON LineStrings
 * @param {Object} overpassData - Raw Overpass API response
 * @returns {Array} Array of GeoJSON features
 */
function overpassToGeoJSON(overpassData) {
  const features = [];

  if (!overpassData.elements) {
    return features;
  }

  for (const element of overpassData.elements) {
    if (element.type === 'way' && element.geometry) {
      // Convert to GeoJSON LineString
      const coordinates = element.geometry.map(node => [node.lon, node.lat]);

      features.push({
        type: 'Feature',
        properties: {
          id: element.id,
          highway: element.tags?.highway || 'unknown',
          name: element.tags?.name || null,
          surface: element.tags?.surface || null
        },
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      });
    }
  }

  return features;
}

/**
 * Fetch roads from Overpass API for a bounding box
 * @param {Object} bounds - {south, west, north, east} or {minLat, maxLat, minLon, maxLon}
 * @param {string} bikeType - 'fastbike', 'gravel', or 'trekking'
 * @returns {Promise<Array>} Array of GeoJSON road features
 */
export async function fetchRoadsInArea(bounds, bikeType = 'trekking') {
  // Normalize bounds format
  const normalizedBounds = {
    south: bounds.south ?? bounds.minLat,
    north: bounds.north ?? bounds.maxLat,
    west: bounds.west ?? bounds.minLon,
    east: bounds.east ?? bounds.maxLon
  };

  // Add small buffer to bounds (0.01 degrees ~ 1km)
  const bufferedBounds = {
    south: normalizedBounds.south - 0.01,
    north: normalizedBounds.north + 0.01,
    west: normalizedBounds.west - 0.01,
    east: normalizedBounds.east + 0.01
  };

  const query = buildOverpassQuery(bufferedBounds, bikeType);

  console.log(`Fetching ${bikeType} roads from Overpass API...`);
  console.log(`Bounds: [${bufferedBounds.south.toFixed(4)}, ${bufferedBounds.west.toFixed(4)}] to [${bufferedBounds.north.toFixed(4)}, ${bufferedBounds.east.toFixed(4)}]`);

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `data=${encodeURIComponent(query)}`
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const roads = overpassToGeoJSON(data);

    console.log(`Fetched ${roads.length} road segments for ${bikeType}`);

    return roads;
  } catch (error) {
    console.error('Failed to fetch roads from Overpass:', error);
    throw new Error(`Road data fetch failed: ${error.message}`);
  }
}

/**
 * Get description of road filter for a bike type
 * @param {string} bikeType
 * @returns {string}
 */
export function getBikeTypeDescription(bikeType) {
  return ROAD_FILTERS[bikeType]?.description || ROAD_FILTERS.trekking.description;
}

/**
 * Get available bike types
 * @returns {Array<string>}
 */
export function getAvailableBikeTypes() {
  return Object.keys(ROAD_FILTERS);
}
