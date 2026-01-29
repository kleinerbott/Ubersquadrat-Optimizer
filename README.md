# Übersquadrat-Optimizer

Eine webbasierte Anwendung zur Optimierung geografischer Erkundungstouren. Die Anwendung analysiert bereits besuchte Bereiche und empfiehlt strategisch optimale nächste Ziele zur effizienten Gebietserweiterung mit integrierter Fahrrad-Routenplanung durch BRouter.

## Features

- **Strategische Expansion**: Intelligenter Algorithmus zur Empfehlung der nächsten zu besuchenden Quadrate
- **Hole-Filling**: Automatische Erkennung und Priorisierung von Lücken im besuchten Gebiet
- **Fahrrad-Routing**: Integration mit BRouter für realistische Fahrradrouten
- **Road-Aware Waypoints**: Wegpunkte werden automatisch auf tatsächlichen Straßen platziert
- **TSP-Optimierung**: Nearest Neighbor + 2-Opt Algorithmus für optimale Besuchsreihenfolge
- **GPX/KML Export**: Exportieren Sie Ihre Routen für GPS-Geräte
- **Responsive Design**: Funktioniert auf Desktop und mobilen Geräten

## Voraussetzungen


- **Node.js** (Version 16.x oder höher) 
- **npm** (wird mit Node.js mitgeliefert)
- Ein moderner Webbrowser (Chrome, Firefox)

Prüfen Sie Ihre Installation mit:
```bash
node --version
npm --version
```

## Installation

1. **Repository klonen**
   ```bash
   git clone https://github.com/kleinerbott/Ubersquadrat-Optimizer.git
   cd Ubersquadrat-Optimizer
   ```

2. **Abhängigkeiten installieren**
   ```bash
   npm install
   ```

   Dies installiert alle benötigten Pakete:
   - Vue 3 (Frontend-Framework)
   - Vuetify 3 (UI-Komponenten)
   - Pinia (State Management)
   - Leaflet (Kartendarstellung)
   - Turf.js (Geospatiale Berechnungen)
   - Vite (Build-Tool)

## Entwicklung

### Entwicklungsserver starten

```bash
npm run dev
```

Die Anwendung ist dann verfügbar unter: **http://localhost:8080**

### Produktions-Build erstellen

```bash
npm run build
```

Der optimierte Build wird im Ordner `dist/` erstellt und enthält:
- Minifizierte JavaScript-Dateien
- Optimierte CSS-Dateien
- Hash-basierte Dateinamen für automatisches Cache-Busting

### Produktions-Build lokal testen

```bash
npm run preview
```

Zeigt den Produktions-Build lokal unter **http://localhost:4173** an.

## Verwendung

### 1. KML-Datei laden

- Klicken Sie auf "KML-Datei auswählen"
- Wählen Sie eine KML-Datei mit Ihren besuchten Quadraten
- Die Datei muss ein Übersquadrat mit `size` Attribut enthalten

**KML-Anforderungen:**
- Übersquadrat-Polygon (benannt "ubersquadrat" oder größtes Polygon)
- Size-Attribut am Übersquadrat (z.B. "16" für 16×16 Grid)
- Besuchte Quadrate als Polygone in WGS84-Koordinaten

### 2. Optimierung durchführen

- Wählen Sie Richtungen (N/S/E/W) für die Expansion
- Stellen Sie die Anzahl der zu empfehlenden Quadrate ein (1-30)
- Wählen Sie den Optimierungsmodus:
  - **Edge**: Priorisiert Randerweiterung
  - **Holes**: Priorisiert Lückenfüllung
  - **Balanced**: Ausgewogene Strategie
- Klicken Sie auf "Optimieren"

Gelbe Rechtecke auf der Karte zeigen die empfohlenen Quadrate.

### 3. Route berechnen

- Wählen Sie einen Fahrrad-Typ (Trekking, Gravel, Fastbike)
- Klicken Sie auf die Karte, um einen Startpunkt festzulegen
- Optional: Aktivieren Sie "Rundtour" für Rückkehr zum Start
- Klicken Sie auf "Route berechnen"

Die blaue Linie zeigt die optimierte Fahrradroute.

### 4. Route exportieren

- **GPX/KML-Export**: Für Garmin, Wahoo, Komoot, etc.


## Lizenz

Dieses Projekt wurde im Rahmen einer Projektarbeit entwickelt.

## Credits

- BRouter für Fahrrad-Routing
- OpenStreetMap für Kartendaten
- Overpass API für Straßendaten-Abfragen
