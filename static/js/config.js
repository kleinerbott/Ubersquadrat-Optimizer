/**
 * Application Configuration
 * Centralized configuration for the Squadrats Navigator application
 */

export const CONFIG = {
  // Grid Configuration
  SCAN_RADIUS_BUFFER: 20,      // Extra squares beyond ubersquadrat for scanning visited squares
  GRID_DISPLAY_BUFFER: 10,     // Extra squares to display in grid visualization
  GRID_CELL_CENTER_OFFSET: 0.5, // Offset to calculate cell center (0.5 = middle of cell)

  // Grid Line Styling
  GRID_LINE_COLOR: '#555555',     // Horizontal grid lines
  GRID_LINE_OPACITY: 1,
  GRID_VERTICAL_COLOR: '#888888', // Vertical grid lines (lighter)
  GRID_VERTICAL_OPACITY: 0.3,

  // Map Feature Colors
  UBERSQUADRAT_COLOR: '#0000ff',
  UBERSQUADRAT_OPACITY: 0.1,
  PROPOSED_COLOR: '#ffd700',
  PROPOSED_OPACITY: 0.3,
  VISITED_COLOR: '#00ff00',
  VISITED_BORDER_COLOR: '#007700',
  VISITED_OPACITY: 0.1,

  // Routing Configuration
  ROUTE_LINE_COLOR: '#ffff00ff',
  ROUTE_LINE_WEIGHT: 4,
  ROUTE_LINE_OPACITY: 0.7,
  START_MARKER_COLOR: '#00cc00',
  START_MARKER_RADIUS: 8,
  MAX_ROUTE_WAYPOINTS: 50,
  MAX_WAYPOINT_MARKERS: 30,    // Maximum waypoints before hiding markers
  BROUTER_API_URL: 'https://brouter.de/brouter',

  // DOM Element IDs
  DOM_IDS: {
    KML_SELECT: 'kmlSelect',
    OPTIMIZE_BTN: 'optimizeBtn',
    NUM_ADD: 'numAdd',
    DIRECTION_BTN_N: 'directionBtnN',
    DIRECTION_BTN_S: 'directionBtnS',
    DIRECTION_BTN_E: 'directionBtnE',
    DIRECTION_BTN_W: 'directionBtnW',
    DIRECTION_BTN_ALL: 'directionBtnAll',
    OPTIMIZATION_MODE: 'optimizationMode',
    MAX_HOLE_SIZE: 'maxHoleSize',
    BIKE_TYPE: 'bikeType',
    ROUNDTRIP: 'roundtrip',
    SELECT_START_BTN: 'selectStartBtn',
    START_POINT_STATUS: 'startPointStatus',
    CALCULATE_ROUTE_BTN: 'calculateRouteBtn',
    ROUTE_DISTANCE: 'routeDistance',
    ROUTE_ELEVATION: 'routeElevation',
    ROUTE_TIME: 'routeTime',
    ROUTE_STATS: 'routeStats',
    ROUTE_EXPORT: 'routeExport',
    EXPORT_GPX_BTN: 'exportGpxBtn',
    EXPORT_KML_BTN: 'exportKmlBtn'
  }
};
