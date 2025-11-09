import { optimizeSquare } from './optimizer.js';

/*  Leaflet Map */
const map = L.map('map').setView([51.7,8.3],10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);


/* Data Containers */
const visitedLayer = L.layerGroup().addTo(map);
const proposedLayer = L.layerGroup().addTo(map);
const gridLayer = L.layerGroup().addTo(map);
let LAT_STEP, LON_STEP, originLat, originLon;
let visitedSet = new Set();
let baseSquare = null;
let kmlLoading = false;  // Flag to prevent race condition

// KML Auswahl initialisieren
fetch('/api/kmlfiles').then(r=>r.json()).then(files=>{
  const sel=document.getElementById('kmlSelect');
  files.forEach(f=>{
    const opt=document.createElement('option');
    opt.value=f; opt.textContent=f; sel.appendChild(opt);
  });
  if(files.length>0) loadKml(files[0]);
  sel.addEventListener('change',()=>loadKml(sel.value));
});

function loadKml(filename){
  kmlLoading = true;  // Set loading flag
  visitedLayer.clearLayers(); proposedLayer.clearLayers();
  const layer = omnivore.kml(`/data/${filename}`);
  layer.on('ready',()=>{

    const features = [];
    const allPolygons = []; // All polygons including ubersquadrats
    const candidates = [];

    layer.eachLayer(l=>{
      if(l.setStyle) l.setStyle({fillColor:'#00ff00',color:'#007700',fillOpacity:0.3});

      const featureName = l.feature?.properties?.name?.toLowerCase() || '';
      const isUbersquadrat = featureName.includes('ubersquadrat') && !featureName.includes('ubersquadratinho');
      const isUbersquadratinho = featureName.includes('ubersquadratinho') || featureName.includes('squadratinho');

      // Skip ubersquadratinho features completely
      if (isUbersquadratinho) {
        return;
      }

      if(l.feature?.geometry){
        const geometry = l.feature.geometry;

        // Handle different geometry types
        let polygonsToProcess = [];

        if (geometry.type === 'Polygon') {
            // Store full polygon including holes
            polygonsToProcess.push({
              outer: geometry.coordinates[0],
              holes: geometry.coordinates.slice(1) // All inner rings (holes)
            });
        } else if (geometry.type === 'MultiPolygon') {
            // Extract all polygons from MultiPolygon
            geometry.coordinates.forEach(polyCoords => {
              polygonsToProcess.push({
                outer: polyCoords[0],
                holes: polyCoords.slice(1)
              });
            });
        } else if (geometry.type === 'GeometryCollection') {
            // Extract polygons from GeometryCollection
            geometry.geometries.forEach(geom => {
              if (geom.type === 'Polygon') {
                polygonsToProcess.push({
                  outer: geom.coordinates[0],
                  holes: geom.coordinates.slice(1)
                });
              } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(polyCoords => {
                  polygonsToProcess.push({
                    outer: polyCoords[0],
                    holes: polyCoords.slice(1)
                  });
                });
              }
            });
        } else if (geometry.type === 'Point') {
            return; // Skip points
        } else {
            return;
        }


        // Process each polygon (with holes)
        polygonsToProcess.forEach(polyData => {
          // Convert outer ring: [lon, lat] → [lat, lon]
          const outerLatLon = polyData.outer.map(c=>[c[1],c[0]]);

          // Convert holes: [lon, lat] → [lat, lon]
          const holesLatLon = polyData.holes.map(hole => hole.map(c=>[c[1],c[0]]));

          // Add all polygons to allPolygons with full structure
          allPolygons.push({
            outer: outerLatLon,
            holes: holesLatLon
          });

          if(isUbersquadrat){
            candidates.push({
              name: l.feature.properties.name,
              coords: outerLatLon,  // Keep coords for compatibility
              size: parseInt(l.feature.properties.size) || 16
            });
          } else {
            // Only add non-ubersquadrat polygons to features for step calculation
            features.push({outer: outerLatLon, holes: holesLatLon});

            // Collect actual square coordinates to determine grid alignment
            if (!isUbersquadrat) {
              const lats = outerLatLon.map(p => p[0]);
              const lons = outerLatLon.map(p => p[1]);
              const minLat = Math.min(...lats);
              const minLon = Math.min(...lons);
              const maxLat = Math.max(...lats);
              const maxLon = Math.max(...lons);

              // Store min coordinates to help determine grid origin
              if (!window.actualSquareCorners) {
                window.actualSquareCorners = [];
              }
              window.actualSquareCorners.push({ minLat, minLon, maxLat, maxLon });

            }
          }
        });
      }
    });


    // --- STEP 1: Find übersquadrat first ---
    let overCoords = null;

    if (candidates.length>0){
      // Nimm größtes gefundene Übersquadrat-Kandidat
      let maxArea=0;
      for (const c of candidates){
        const lats=c.coords.map(p=>p[0]), lons=c.coords.map(p=>p[1]);
        const area=(Math.max(...lats)-Math.min(...lats))*(Math.max(...lons)-Math.min(...lons));

        if(area>maxArea){
          maxArea=area;
          overCoords=c.coords;
        }
      }
    } else {
      // Fallback: größtes Polygon nach Fläche
      let maxArea=0;
      for (const f of features){
        const lats=f.coords.map(p=>p[0]), lons=f.coords.map(p=>p[1]);
        const area=(Math.max(...lats)-Math.min(...lats))*(Math.max(...lons)-Math.min(...lons));
        if(area>maxArea){
          maxArea=area;
          overCoords=f.coords;
        }
      }
    }

    if(!overCoords){ alert("Kein Übersquadrat gefunden."); return; }

    // --- STEP 2: Calculate grid steps from all non-ubersquadrat polygons ---
    if (features.length === 0) {
      alert('Keine Polygone im KML gefunden');
      return;
    }

    // === NEW APPROACH: Build everything from ubersquadrat coordinates ===
    console.log('=== Building grid from ubersquadrat KML coordinates ===');

    // Extract ubersquadrat polygon vertices - these define the grid
    const uberPolygon = candidates[0].coords;
    const allLats = [...new Set(uberPolygon.map(p => p[0]))].sort((a, b) => a - b);
    const allLons = [...new Set(uberPolygon.map(p => p[1]))].sort((a, b) => a - b);

    console.log('Ubersquadrat has', allLats.length, 'unique latitudes and', allLons.length, 'unique longitudes');

    // Calculate grid steps from ubersquadrat size attribute
    // The ubersquadrat KML contains a 'size' property (e.g., 16 for a 16x16 grid)
    const uberSize = candidates[0].size;
    console.log('Ubersquadrat size:', uberSize, 'x', uberSize, 'squadrats');

    // Calculate ubersquadrat bounds
    const lats = overCoords.map(c=>c[0]);
    const lons = overCoords.map(c=>c[1]);
    const uberMinLat = Math.min(...lats);
    const uberMaxLat = Math.max(...lats);
    const uberMinLon = Math.min(...lons);
    const uberMaxLon = Math.max(...lons);

    // Calculate grid steps directly from ubersquadrat dimensions
    // Since we know it's exactly uberSize x uberSize squadrats
    LAT_STEP = (uberMaxLat - uberMinLat) / uberSize;
    LON_STEP = (uberMaxLon - uberMinLon) / uberSize;

    console.log('Grid steps from ubersquadrat:', 'LAT=', LAT_STEP.toFixed(7), 'LON=', LON_STEP.toFixed(7));

    // Set grid origin to ubersquadrat SW corner - this defines the authoritative grid
    // The ubersquadrat has exact dimensions (size × size), so it defines grid alignment
    originLat = uberMinLat;
    originLon = uberMinLon;
    console.log('Grid origin (ubersquadrat SW corner):', originLat.toFixed(7), originLon.toFixed(7));

    // --- Build visited set using grid-based scanning ---
    visitedSet = new Set();

    console.log('Starting grid-based scan of', allPolygons.length, 'polygons...');

    // Helper: Check if point is inside a ring using ray casting
    function isPointInRing(lat, lon, ring) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const latI = ring[i][0], lonI = ring[i][1];
        const latJ = ring[j][0], lonJ = ring[j][1];

        const intersect = ((lonI > lon) !== (lonJ > lon))
            && (lat < (latJ - latI) * (lon - lonI) / (lonJ - lonI) + latI);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    // Helper: Check if point is inside polygon with holes
    function isPointInPolygonWithHoles(lat, lon, polygon) {
      // Check if point is inside outer ring
      if (!isPointInRing(lat, lon, polygon.outer)) {
        return false;  // Not inside outer boundary
      }

      // Check if point is inside any hole (if so, it's NOT visited)
      for (const hole of polygon.holes) {
        if (isPointInRing(lat, lon, hole)) {
          return false;  // Point is in a hole = unvisited
        }
      }

      return true;  // Inside outer ring and not in any hole = visited
    }

    // Ubersquadrat grid indices - since origin is at ubersquadrat SW corner
    const uberMinI = 0;
    const uberMaxI = uberSize - 1;
    const uberMinJ = 0;
    const uberMaxJ = uberSize - 1;

    console.log('Ubersquadrat grid: i=[', uberMinI, 'to', uberMaxI, '], j=[', uberMinJ, 'to', uberMaxJ, ']');

    // Define scan area (extend beyond ubersquadrat)
    const scanMinI = uberMinI - 20;
    const scanMaxI = uberMaxI + 20;
    const scanMinJ = uberMinJ - 20;
    const scanMaxJ = uberMaxJ + 20;

    console.log('Scanning grid area: i=[', scanMinI, 'to', scanMaxI, '], j=[', scanMinJ, 'to', scanMaxJ, ']');

    // Scan each grid cell
    let gridCellsChecked = 0;
    let gridCellsMarked = 0;

    for (let i = scanMinI; i <= scanMaxI; i++) {
      for (let j = scanMinJ; j <= scanMaxJ; j++) {
        gridCellsChecked++;

        // Calculate grid cell center
        const cellCenterLat = originLat + (i + 0.5) * LAT_STEP;
        const cellCenterLon = originLon + (j + 0.5) * LON_STEP;

        // Check if this cell center is inside any polygon
        let foundInPolygon = false;

        for (const poly of allPolygons) {
          // Check if point is inside polygon (accounting for holes)
          if (isPointInPolygonWithHoles(cellCenterLat, cellCenterLon, poly)) {
            foundInPolygon = true;
            break;
          }
        }

        if (foundInPolygon) {
          visitedSet.add(`${i},${j}`);
          gridCellsMarked++;
        }
      }
    }

    console.log('Grid scan complete:', gridCellsChecked, 'cells checked,', gridCellsMarked, 'cells marked as visited');
    console.log('Visited set size:', visitedSet.size);

    // Use the same grid coordinates we calculated earlier for the visited set
    baseSquare = {minI: uberMinI, maxI: uberMaxI, minJ: uberMinJ, maxJ: uberMaxJ};
    console.log("Base square grid coords:", baseSquare);

    // Draw the blue rectangle using grid-aligned coordinates
    // This helps visualize whether our grid is correctly aligned
    const gridAlignedMinLat = originLat + uberMinI * LAT_STEP;
    const gridAlignedMaxLat = originLat + (uberMaxI + 1) * LAT_STEP;
    const gridAlignedMinLon = originLon + uberMinJ * LON_STEP;
    const gridAlignedMaxLon = originLon + (uberMaxJ + 1) * LON_STEP;

    console.log('Blue rectangle grid-aligned coords:',
      '[', gridAlignedMinLat.toFixed(6), ',', gridAlignedMinLon.toFixed(6), '] to',
      '[', gridAlignedMaxLat.toFixed(6), ',', gridAlignedMaxLon.toFixed(6), ']');
    console.log('vs actual ubersquadrat bounds:',
      '[', uberMinLat.toFixed(6), ',', uberMinLon.toFixed(6), '] to',
      '[', uberMaxLat.toFixed(6), ',', uberMaxLon.toFixed(6), ']');

    L.rectangle([[gridAlignedMinLat, gridAlignedMinLon],[gridAlignedMaxLat, gridAlignedMaxLon]], {color:'#0000ff',fillColor:'#0000ff',fillOpacity:0.15}).addTo(visitedLayer);

    // --- Draw grid lines ---
    gridLayer.clearLayers();
    console.log('Drawing grid lines...');

    // Calculate grid area to cover (extend beyond ubersquadrat by 10 squares)
    const gridMinI = uberMinI - 10;
    const gridMaxI = uberMaxI + 10;
    const gridMinJ = uberMinJ - 10;
    const gridMaxJ = uberMaxJ + 10;

    // Draw horizontal grid lines (constant latitude)
    for (let i = gridMinI; i <= gridMaxI + 1; i++) {
      const lat = originLat + i * LAT_STEP; 
      const lonStart = originLon + gridMinJ * LON_STEP;
      const lonEnd = originLon + (gridMaxJ + 1) * LON_STEP;

      L.polyline([[lat, lonStart], [lat, lonEnd]], {
        color: '#555555',
        weight: 1,
        opacity: 1
      }).addTo(gridLayer);
    }

    // Draw vertical grid lines (constant longitude)
    for (let j = gridMinJ; j <= gridMaxJ + 1; j++) {
      const lon = originLon + j * LON_STEP;
      const latStart = originLat + gridMinI * LAT_STEP;
      const latEnd = originLat + (gridMaxI + 1) * LAT_STEP;

      L.polyline([[latStart, lon], [latEnd, lon]], {
        color: '#888888',
        weight: 1,
        opacity: 0.3
      }).addTo(gridLayer);
    }

    console.log('Grid drawn:', (gridMaxI - gridMinI + 2), 'horizontal lines,', (gridMaxJ - gridMinJ + 2), 'vertical lines');

    map.fitBounds([[uberMinLat, uberMinLon],[uberMaxLat, uberMaxLon]]);

    // Clear loading flag - KML is fully loaded and visitedSet is complete
    kmlLoading = false;
    console.log('KML loading complete, ready for optimization');
  });

  layer.addTo(visitedLayer);
}


document.getElementById('optimizeBtn').addEventListener('click',()=>{
  if(kmlLoading){ alert('KML wird noch geladen, bitte warten...'); return; }
  if(!baseSquare){ alert('Noch kein Übersquadrat erkannt'); return; }
  const n=parseInt(document.getElementById('numAdd').value);
  const dir=document.getElementById('direction').value;
  const newRects=optimizeSquare(baseSquare,n,dir,visitedSet,LAT_STEP,LON_STEP,originLat,originLon);
  proposedLayer.clearLayers();
  newRects.forEach(r=>{
    L.rectangle(r,{color:'#ffd700',fillColor:'#ffd700',fillOpacity:0.3}).addTo(proposedLayer);
  });
});
