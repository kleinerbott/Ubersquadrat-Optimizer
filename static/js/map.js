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
            polygonsToProcess.push(geometry.coordinates[0]);
        } else if (geometry.type === 'MultiPolygon') {
            // Extract all polygons from MultiPolygon
            geometry.coordinates.forEach(polyCoords => {
              polygonsToProcess.push(polyCoords[0]); // outer ring
            });
        } else if (geometry.type === 'GeometryCollection') {
            // Extract polygons from GeometryCollection
            geometry.geometries.forEach(geom => {
              if (geom.type === 'Polygon') {
                polygonsToProcess.push(geom.coordinates[0]);
              } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(polyCoords => {
                  polygonsToProcess.push(polyCoords[0]);
                });
              }
            });
        } else if (geometry.type === 'Point') {
            return; // Skip points
        } else {
            return;
        }


        // Process each polygon
        polygonsToProcess.forEach(coordsList => {
          const latlon = coordsList.map(c=>[c[1],c[0]]); // [lon, lat] zu [lat, lon] tauschen

          // Add all polygons to allPolygons
          allPolygons.push({coords:latlon});

          if(isUbersquadrat){
            candidates.push({
              name: l.feature.properties.name,
              coords: latlon,
              size: parseInt(l.feature.properties.size) || 16
            });
          } else {
            // Only add non-ubersquadrat polygons to features for step calculation
            features.push({coords:latlon});

            // Collect actual square coordinates to determine grid alignment
            if (!isUbersquadrat) {
              const lats = latlon.map(p => p[0]);
              const lons = latlon.map(p => p[1]);
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

    // Set origin to the ubersquadrat minimum corner
    // This ensures the grid aligns with the ubersquadrat boundaries
    originLat = uberMinLat;
    originLon = uberMinLon;
    console.log('Grid origin (ubersquadrat SW corner):', originLat.toFixed(7), originLon.toFixed(7));

    // --- Build visited set from ALL actual polygons with centroid matching ---
    visitedSet = new Set();

    console.log('Checking', allPolygons.length, 'polygons to build visited set...');

    allPolygons.forEach((poly, idx) => {
      // Skip large polygons (ubersquadrat itself)
      if (poly.coords.length > 100) {
        console.log('Skipping large polygon with', poly.coords.length, 'vertices');
        return;
      }

      // Calculate centroid
      const lats = poly.coords.map(p => p[0]);
      const lons = poly.coords.map(p => p[1]);
      const centroidLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centroidLon = (Math.min(...lons) + Math.max(...lons)) / 2;

      // Convert to grid index (with tolerance - round to nearest)
      const i = Math.round((centroidLat - originLat) / LAT_STEP);
      const j = Math.round((centroidLon - originLon) / LON_STEP);

      visitedSet.add(`${i},${j}`);

      if (idx < 5) {
        console.log('Polygon', idx, ': centroid [', centroidLat.toFixed(6), ',', centroidLon.toFixed(6), '] -> grid [', i, ',', j, ']');
      }
    });

    console.log('Visited set:', visitedSet.size, 'unique grid squares from', allPolygons.length, 'polygons');
    console.log('Sample:', Array.from(visitedSet).slice(0, 10));

    // Convert ubersquadrat bounds to grid indices
    // Since origin is at ubersquadrat SW corner and it's exactly uberSize x uberSize
    const uberMinI = 0;
    const uberMaxI = uberSize - 1;
    const uberMinJ = 0;
    const uberMaxJ = uberSize - 1;

    console.log('Ubersquadrat grid: i=[', uberMinI, 'to', uberMaxI, '], j=[', uberMinJ, 'to', uberMaxJ, ']');
    console.log('Size:', (uberMaxI - uberMinI + 1), 'x', (uberMaxJ - uberMinJ + 1), '=', (uberMaxI - uberMinI + 1) * (uberMaxJ - uberMinJ + 1), 'squares');

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
  });

  layer.addTo(visitedLayer);
}


document.getElementById('optimizeBtn').addEventListener('click',()=>{
  if(!baseSquare){ alert('Noch kein Übersquadrat erkannt'); return; }
  const n=parseInt(document.getElementById('numAdd').value);
  const dir=document.getElementById('direction').value;
  const newRects=optimizeSquare(baseSquare,n,dir,visitedSet,LAT_STEP,LON_STEP,originLat,originLon);
  proposedLayer.clearLayers();
  newRects.forEach(r=>{
    L.rectangle(r,{color:'#ffd700',fillColor:'#ffd700',fillOpacity:0.8}).addTo(proposedLayer);
  });
});
