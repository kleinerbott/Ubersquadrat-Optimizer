import { bench, describe } from 'vitest';
import {
  calculateBounds,
  isPointInPolygonWithHoles,
  calculateArea,
  extractPolygons
} from '../../src/logic/kml-processor.js';

describe('KML Processor Performance', () => {
  // Small polygon (4 points)
  const smallPolygon = {
    outer: [
      [50.0, 8.0],
      [50.1, 8.0],
      [50.1, 8.1],
      [50.0, 8.1],
      [50.0, 8.0]
    ],
    holes: []
  };

  // Medium polygon with holes (16 points + 2 holes)
  const mediumPolygon = {
    outer: [
      [50.0, 8.0],
      [50.2, 8.0],
      [50.2, 8.2],
      [50.0, 8.2],
      [50.0, 8.0]
    ],
    holes: [
      [
        [50.02, 8.02],
        [50.05, 8.02],
        [50.05, 8.05],
        [50.02, 8.05],
        [50.02, 8.02]
      ],
      [
        [50.12, 8.12],
        [50.15, 8.12],
        [50.15, 8.15],
        [50.12, 8.15],
        [50.12, 8.12]
      ]
    ]
  };

  // Large polygon (100 points)
  const largeCoords = [];
  for (let i = 0; i < 100; i++) {
    const angle = (i / 100) * 2 * Math.PI;
    largeCoords.push([
      50.0 + Math.cos(angle) * 0.1,
      8.0 + Math.sin(angle) * 0.1
    ]);
  }
  largeCoords.push(largeCoords[0]); // Close the polygon

  bench('calculateBounds - small polygon (4 points)', () => {
    calculateBounds(smallPolygon.outer);
  });

  bench('calculateBounds - large polygon (100 points)', () => {
    calculateBounds(largeCoords);
  });

  bench('isPointInPolygonWithHoles - simple polygon, point inside', () => {
    isPointInPolygonWithHoles(50.05, 8.05, smallPolygon);
  });

  bench('isPointInPolygonWithHoles - simple polygon, point outside', () => {
    isPointInPolygonWithHoles(50.5, 8.5, smallPolygon);
  });

  bench('isPointInPolygonWithHoles - polygon with holes, point outside hole', () => {
    isPointInPolygonWithHoles(50.1, 8.1, mediumPolygon);
  });

  bench('isPointInPolygonWithHoles - polygon with holes, point inside hole', () => {
    isPointInPolygonWithHoles(50.03, 8.03, mediumPolygon);
  });

  bench('isPointInPolygonWithHoles - hot path (100 checks)', () => {
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        isPointInPolygonWithHoles(50.0 + i * 0.01, 8.0 + j * 0.01, smallPolygon);
      }
    }
  });

  bench('calculateArea - small polygon', () => {
    calculateArea(smallPolygon.outer);
  });

  bench('calculateArea - large polygon (100 points)', () => {
    calculateArea(largeCoords);
  });

  // GeoJSON geometries for extractPolygons benchmarks
  const simpleGeometry = {
    type: 'Polygon',
    coordinates: [
      [[8.0, 50.0], [8.1, 50.0], [8.1, 50.1], [8.0, 50.1], [8.0, 50.0]]
    ]
  };

  const multiPolygonGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      [[[8.0, 50.0], [8.1, 50.0], [8.1, 50.1], [8.0, 50.1], [8.0, 50.0]]],
      [[[8.2, 50.2], [8.3, 50.2], [8.3, 50.3], [8.2, 50.3], [8.2, 50.2]]],
      [[[8.4, 50.4], [8.5, 50.4], [8.5, 50.5], [8.4, 50.5], [8.4, 50.4]]],
      [[[8.6, 50.6], [8.7, 50.6], [8.7, 50.7], [8.6, 50.7], [8.6, 50.6]]]
    ]
  };

  const geometryCollection = {
    type: 'GeometryCollection',
    geometries: [
      simpleGeometry,
      simpleGeometry,
      simpleGeometry,
      simpleGeometry
    ]
  };

  bench('extractPolygons - simple Polygon', () => {
    extractPolygons(simpleGeometry);
  });

  bench('extractPolygons - MultiPolygon (4 polygons)', () => {
    extractPolygons(multiPolygonGeometry);
  });

  bench('extractPolygons - GeometryCollection', () => {
    extractPolygons(geometryCollection);
  });
});
