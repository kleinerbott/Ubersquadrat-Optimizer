export function optimizeSquare(base, targetNew, direction, visitedSet, LAT_STEP, LON_STEP, originLat, originLon) {
  console.log('Optimizer called with base:', base, 'direction:', direction, 'targetNew:', targetNew);
  console.log('Ubersquadrat bounds: i=[', base.minI, ',', base.maxI, '], j=[', base.minJ, ',', base.maxJ, ']');
  console.log('Visited set has', visitedSet.size, 'squares');

  function rectFromIJ(i,j){
    const s = originLat + i * LAT_STEP;
    const w = originLon + j * LON_STEP;
    const n = s + LAT_STEP;
    const e = w + LON_STEP;
    return [[s,w],[n,e]];
  }

  // Find unvisited squares that are OUTSIDE the ubersquadrat but adjacent to visited squares
  function findPerimeterSquares() {
    const candidates = new Map(); // Use map to avoid duplicates

    // Only search OUTSIDE the ubersquadrat bounding box (±2 squares margin)
    const searchMinI = base.minI - 2;
    const searchMaxI = base.maxI + 2;
    const searchMinJ = base.minJ - 2;
    const searchMaxJ = base.maxJ + 2;

    console.log('Searching for perimeter outside ubersquadrat bounds:', searchMinI, 'to', searchMaxI, ',', searchMinJ, 'to', searchMaxJ);

    // Check each square in the search area
    for (let i = searchMinI; i <= searchMaxI; i++) {
      for (let j = searchMinJ; j <= searchMaxJ; j++) {
        const key = `${i},${j}`;

        // Skip if already visited
        if (visitedSet.has(key)) continue;

        // IMPORTANT: Only consider squares OUTSIDE the ubersquadrat interior
        // A square is "outside" if it's beyond the ubersquadrat edges
        const isOutsideNorth = (i > base.maxI);
        const isOutsideSouth = (i < base.minI);
        const isOutsideEast = (j > base.maxJ);
        const isOutsideWest = (j < base.minJ);

        const isOutside = isOutsideNorth || isOutsideSouth || isOutsideEast || isOutsideWest;

        if (!isOutside) continue; // Skip squares inside the ubersquadrat

        // Check if this square is adjacent to a visited square (N/S/E/W)
        const neighbors = [
          `${i-1},${j}`,  // South
          `${i+1},${j}`,  // North
          `${i},${j-1}`,  // West
          `${i},${j+1}`,  // East
        ];

        const hasVisitedNeighbor = neighbors.some(n => visitedSet.has(n));

        if (hasVisitedNeighbor) {
          // Determine which edge based on position relative to base
          let edge = '';
          if (isOutsideNorth) edge += 'N';
          if (isOutsideSouth) edge += 'S';
          if (isOutsideEast) edge += 'E';
          if (isOutsideWest) edge += 'W';

          candidates.set(key, {i, j, edge, key});
        }
      }
    }

    console.log('Found', candidates.size, 'perimeter squares outside ubersquadrat adjacent to visited area');

    return Array.from(candidates.values());
  }

  // Get all perimeter squares
  const allCandidates = findPerimeterSquares();

  // Filter by direction preference
  let filtered = allCandidates;
  if (direction !== 'all') {
    filtered = allCandidates.filter(c => {
      if (direction === 'N') return c.edge.includes('N');
      if (direction === 'S') return c.edge.includes('S');
      if (direction === 'E') return c.edge.includes('E');
      if (direction === 'W') return c.edge.includes('W');
      return true;
    });
  }

  console.log('After direction filter (', direction, '):', filtered.length, 'candidates');

  // Remove already visited squares
  const unvisited = filtered.filter(c => !visitedSet.has(`${c.i},${c.j}`));
  console.log('After removing visited:', unvisited.length, 'unvisited squares');

  // Don't sort by distance - select squares in their natural order
  // This ensures all adjacent unvisited squares are considered equally
  // Previously: sorted by distance from center, which de-prioritized corner squares

  // Take first targetNew squares
  const selected = unvisited.slice(0, targetNew);

  console.log('Selected', selected.length, 'squares:');
  selected.forEach(s => {
    console.log('  Square', s.i, s.j, 'edge:', s.edge, 'coords:', rectFromIJ(s.i, s.j)[0]);
  });

  const results = selected.map(s => rectFromIJ(s.i, s.j));
  return results;
}
