/**
 * Application Configuration
 * Centralized configuration for the Squadrats Navigator application
 */

export const CONFIG = {
  // Grid Configuration
  SCAN_RADIUS_RANGE: 20,      // Extra squares beyond ubersquadrat for scanning visited squares
  GRID_DISPLAY_RANGE: 150,     // Extra squares to display in grid visualization
  GRID_CELL_CENTER_OFFSET: 0.5, // Offset to calculate cell center (0.5 = middle of cell)

  // Grid Line Styling
  GRID_LINE_COLOR: '#555555',     // Horizontal grid lines
  GRID_LINE_OPACITY: 0.3,
  GRID_VERTICAL_COLOR: '#888888', // Vertical grid lines (lighter)
  GRID_VERTICAL_OPACITY: 0.2,

  // Map Feature Colors
  UBERSQUADRAT_COLOR: '#0000ff',
  UBERSQUADRAT_OPACITY: 0.1,
  PROPOSED_COLOR: '#ffd700',
  PROPOSED_OPACITY: 0.3,
  VISITED_COLOR: '#00ff00',
  VISITED_BORDER_COLOR: '#007700',
  VISITED_OPACITY: 0.1,

  // Routing Configuration
  ROUTE_LINE_COLOR: '#f700ffff',
  ROUTE_LINE_WEIGHT: 4,
  ROUTE_LINE_OPACITY: 0.7,
  START_MARKER_COLOR: '#00cc00',
  START_MARKER_RADIUS: 8,
  MAX_ROUTE_WAYPOINTS: 50,
  MAX_WAYPOINT_MARKERS: 33,
  BROUTER_API_URL: 'https://brouter.de/brouter',

  // Waypoint Optimization
  DEBUG_WAYPOINT_CANDIDATES: true  // Set to true to see detailed candidate logging
};
