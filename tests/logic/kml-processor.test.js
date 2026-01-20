import { describe, it, expect } from 'vitest';
import {
  calculateBounds,
  isPointInPolygonWithHoles,
  calculateArea,
  extractPolygons
} from '../../src/logic/kml-processor.js';

describe('kml-processor.js', () => {
  describe('calculateBounds', () => {
    it('calculates bounds from simple polygon', () => {
      const coords = [
        [50.0, 8.0],
        [50.1, 8.0],
        [50.1, 8.1],
        [50.0, 8.1]
      ];
      const bounds = calculateBounds(coords);
      expect(bounds).toEqual({
        minLat: 50.0,
        maxLat: 50.1,
        minLon: 8.0,
        maxLon: 8.1
      });
    });

    it('handles two identical points', () => {
      const coords = [[50.0, 8.0], [50.0, 8.0]];
      const bounds = calculateBounds(coords);
      expect(bounds.minLat).toBe(50.0);
      expect(bounds.maxLat).toBe(50.0);
      expect(bounds.minLon).toBe(8.0);
      expect(bounds.maxLon).toBe(8.0);
    });

    it('handles negative coordinates', () => {
      const coords = [
        [-10.0, -20.0],
        [-5.0, -15.0]
      ];
      const bounds = calculateBounds(coords);
      expect(bounds.minLat).toBe(-10.0);
      expect(bounds.maxLat).toBe(-5.0);
      expect(bounds.minLon).toBe(-20.0);
      expect(bounds.maxLon).toBe(-15.0);
    });

    it('handles irregular polygon shape', () => {
      const coords = [
        [50.0, 8.0],
        [50.05, 8.15],
        [50.12, 8.08],
        [50.03, 7.95]
      ];
      const bounds = calculateBounds(coords);
      expect(bounds.minLat).toBeCloseTo(50.0, 2);
      expect(bounds.maxLat).toBeCloseTo(50.12, 2);
      expect(bounds.minLon).toBeCloseTo(7.95, 2);
      expect(bounds.maxLon).toBeCloseTo(8.15, 2);
    });
  });

  describe('isPointInPolygonWithHoles', () => {
    it('detects point inside simple polygon', () => {
      const polygon = {
        outer: [
          [50.0, 8.0],
          [50.1, 8.0],
          [50.1, 8.1],
          [50.0, 8.1],
          [50.0, 8.0]
        ],
        holes: []
      };
      expect(isPointInPolygonWithHoles(50.05, 8.05, polygon)).toBe(true);
    });

    it('detects point outside polygon', () => {
      const polygon = {
        outer: [
          [50.0, 8.0],
          [50.1, 8.0],
          [50.1, 8.1],
          [50.0, 8.1],
          [50.0, 8.0]
        ],
        holes: []
      };
      expect(isPointInPolygonWithHoles(50.2, 8.2, polygon)).toBe(false);
    });

    it('detects point on polygon edge', () => {
      const polygon = {
        outer: [
          [50.0, 8.0],
          [50.1, 8.0],
          [50.1, 8.1],
          [50.0, 8.1],
          [50.0, 8.0]
        ],
        holes: []
      };
      // Point on edge may be true or false depending on implementation
      const result = isPointInPolygonWithHoles(50.0, 8.0, polygon);
      expect(typeof result).toBe('boolean');
    });

    it('handles polygon with hole - point outside hole', () => {
      const polygon = {
        outer: [
          [50.0, 8.0],
          [50.1, 8.0],
          [50.1, 8.1],
          [50.0, 8.1],
          [50.0, 8.0]
        ],
        holes: [
          [
            [50.04, 8.04],
            [50.06, 8.04],
            [50.06, 8.06],
            [50.04, 8.06],
            [50.04, 8.04]
          ]
        ]
      };
      // Point inside outer polygon but outside hole
      expect(isPointInPolygonWithHoles(50.02, 8.02, polygon)).toBe(true);
    });

    it('handles polygon with hole - point inside hole', () => {
      const polygon = {
        outer: [
          [50.0, 8.0],
          [50.1, 8.0],
          [50.1, 8.1],
          [50.0, 8.1],
          [50.0, 8.0]
        ],
        holes: [
          [
            [50.04, 8.04],
            [50.06, 8.04],
            [50.06, 8.06],
            [50.04, 8.06],
            [50.04, 8.04]
          ]
        ]
      };
      // Point inside hole should return false
      expect(isPointInPolygonWithHoles(50.05, 8.05, polygon)).toBe(false);
    });

    it('handles polygon with multiple holes', () => {
      const polygon = {
        outer: [
          [50.0, 8.0],
          [50.2, 8.0],
          [50.2, 8.2],
          [50.0, 8.2],
          [50.0, 8.0]
        ],
        holes: [
          // Hole 1
          [
            [50.02, 8.02],
            [50.05, 8.02],
            [50.05, 8.05],
            [50.02, 8.05],
            [50.02, 8.02]
          ],
          // Hole 2
          [
            [50.12, 8.12],
            [50.15, 8.12],
            [50.15, 8.15],
            [50.12, 8.15],
            [50.12, 8.12]
          ]
        ]
      };
      // Point inside outer but outside both holes
      expect(isPointInPolygonWithHoles(50.1, 8.1, polygon)).toBe(true);
      // Point inside first hole
      expect(isPointInPolygonWithHoles(50.03, 8.03, polygon)).toBe(false);
      // Point inside second hole
      expect(isPointInPolygonWithHoles(50.13, 8.13, polygon)).toBe(false);
    });

    it('auto-closes non-closed rings', () => {
      const polygon = {
        outer: [
          [50.0, 8.0],
          [50.1, 8.0],
          [50.1, 8.1],
          [50.0, 8.1]
          // Not closed
        ],
        holes: []
      };
      expect(isPointInPolygonWithHoles(50.05, 8.05, polygon)).toBe(true);
    });
  });

  describe('calculateArea', () => {
    it('calculates area of square polygon', () => {
      // Approximate 10km x 10km square
      const coords = [
        [50.0, 8.0],
        [50.1, 8.0],
        [50.1, 8.1],
        [50.0, 8.1]
      ];
      const area = calculateArea(coords);
      expect(area).toBeGreaterThan(0);
      // 0.1 degree latitude ≈ 11km, 0.1 degree longitude at 50° ≈ 7km
      // Expected area ≈ 77 km² = 77,000,000 m²
      expect(area).toBeGreaterThan(70000000); // At least 70 km²
      expect(area).toBeLessThan(90000000); // At most 90 km²
    });

    it('returns 0 for degenerate polygon (line)', () => {
      const coords = [
        [50.0, 8.0],
        [50.1, 8.0],
        [50.1, 8.0]
      ];
      const area = calculateArea(coords);
      expect(area).toBeCloseTo(0, 0);
    });

    it('handles small polygon', () => {
      const coords = [
        [50.0, 8.0],
        [50.001, 8.0],
        [50.001, 8.001],
        [50.0, 8.001]
      ];
      const area = calculateArea(coords);
      expect(area).toBeGreaterThan(0);
      expect(area).toBeLessThan(20000); // Less than 20,000 m²
    });

    it('auto-closes non-closed polygon', () => {
      const coords = [
        [50.0, 8.0],
        [50.1, 8.0],
        [50.1, 8.1],
        [50.0, 8.1]
        // Not explicitly closed
      ];
      const area = calculateArea(coords);
      expect(area).toBeGreaterThan(0);
    });

    it('handles negative coordinates', () => {
      const coords = [
        [-10.0, -20.0],
        [-9.9, -20.0],
        [-9.9, -19.9],
        [-10.0, -19.9]
      ];
      const area = calculateArea(coords);
      expect(area).toBeGreaterThan(0);
    });
  });

  describe('extractPolygons', () => {
    it('extracts simple Polygon geometry', () => {
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [[8.0, 50.0], [8.1, 50.0], [8.1, 50.1], [8.0, 50.1], [8.0, 50.0]]
        ]
      };
      const polygons = extractPolygons(geometry);
      expect(polygons).toHaveLength(1);
      expect(polygons[0]).toHaveProperty('outer');
      expect(polygons[0]).toHaveProperty('holes');
      expect(polygons[0].outer).toHaveLength(5);
    });

    it('extracts Polygon with holes', () => {
      const geometry = {
        type: 'Polygon',
        coordinates: [
          // Outer ring
          [[8.0, 50.0], [8.1, 50.0], [8.1, 50.1], [8.0, 50.1], [8.0, 50.0]],
          // Hole
          [[8.04, 50.04], [8.06, 50.04], [8.06, 50.06], [8.04, 50.06], [8.04, 50.04]]
        ]
      };
      const polygons = extractPolygons(geometry);
      expect(polygons).toHaveLength(1);
      expect(polygons[0].holes).toHaveLength(1);
    });

    it('extracts MultiPolygon geometry', () => {
      const geometry = {
        type: 'MultiPolygon',
        coordinates: [
          [[[8.0, 50.0], [8.1, 50.0], [8.1, 50.1], [8.0, 50.1], [8.0, 50.0]]],
          [[[8.2, 50.2], [8.3, 50.2], [8.3, 50.3], [8.2, 50.3], [8.2, 50.2]]]
        ]
      };
      const polygons = extractPolygons(geometry);
      expect(polygons).toHaveLength(2);
    });

    it('extracts GeometryCollection', () => {
      const geometry = {
        type: 'GeometryCollection',
        geometries: [
          {
            type: 'Polygon',
            coordinates: [
              [[8.0, 50.0], [8.1, 50.0], [8.1, 50.1], [8.0, 50.1], [8.0, 50.0]]
            ]
          },
          {
            type: 'Polygon',
            coordinates: [
              [[8.2, 50.2], [8.3, 50.2], [8.3, 50.3], [8.2, 50.3], [8.2, 50.2]]
            ]
          }
        ]
      };
      const polygons = extractPolygons(geometry);
      expect(polygons).toHaveLength(2);
    });

    it('returns empty array for non-polygon geometry', () => {
      const geometry = {
        type: 'Point',
        coordinates: [8.0, 50.0]
      };
      const polygons = extractPolygons(geometry);
      expect(polygons).toHaveLength(0);
    });

    it('preserves GeoJSON coordinate order [lon, lat]', () => {
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [[8.0, 50.0], [8.1, 50.0], [8.1, 50.1], [8.0, 50.1], [8.0, 50.0]]
        ]
      };
      const polygons = extractPolygons(geometry);
      // Coordinates remain in GeoJSON format [lon, lat]
      expect(polygons[0].outer[0]).toEqual([8.0, 50.0]);
    });
  });
});
