# Welcome to BetterNMSUMaps readme by The Brainy Bunch
 **Project file:** `software-development-semester-project-group-2`
 
 **Suggested Project file:** `software-development-semester-project-BetterNMSUMaps`

 **Possible nickname for future:** `Navigate NMSU Map`

 This will use GitHub Pages for publishing, and testing, 
 TheBrainyBunch requests github pages publishing once files have been added

 # Team Members
 * Sebastian Salgado,
 * Brock Patten,
 * Wax Sahm,
 * Taymari La Cour,
 * Matthew Holets

 ## Overview
 A simple campus map for New Mexico State University. Open the page, see the internal buildings floorplan, and tap one to open info sheet.
 The map stays on campus. Building names, colors, and text come from `config.yml` and the files in `data/`, so you can update those without changing the page layout.
 Published to the web with GitHub Pages.


## Features
- Interactive map bounded & centered on NMSU campus
- Info badges you can tap on
- Building names that appear as you zoom in
- An info sheet with the location name, floorplan, description, address, building number, year built, and floor count
- A link to the same building on NMSU’s official map
- Changeable colors and wording lives in `config.yml`
- Floorplan data lives in `data/floors`
- Buildings data lives in `data/buildings.geojson`
- Descriptions live inside `data/descriptions.json`
  
  
## Buildings on the map
- Hardman and Jacobs Undergraduate Learning Center (HJLC)
- Jett Hall (JH)
- Corbett Center Student Union (CC)
- More to come


# Project Structure
**File Tree:** `software-development-semester-project-group-2`

**Root Path:** `/software-development-semester-project-group-2`

```If you notice this text isnt on the read me its because this line is hidden in the read me. so Chicken butt. 
├── data
│   ├── floors
│   ├── buildings.geojson
│   └── descriptions.json
├── js
│   ├── core
│   │   ├── afterPaint.js
│   │   ├── config.js
│   │   ├── html.js
│   │   └── store.js
│   ├── logic
│   │   └── box.js
│   ├── map
│   │   ├── badges.js
│   │   └── campusMap.js
│   ├── sheet
│   │   └── buildingSheet.js
│   └── main.js
├── styles
│   ├── base.css
│   ├── map.css
│   └── sheet.css
├── README.md
├── config.yml
└── index.html


