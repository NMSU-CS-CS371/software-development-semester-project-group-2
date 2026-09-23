# Welcome to BetterNMSUMaps readme by The Brainy Bunch
 **Project file:** `software-development-semester-project-group-2`

 **Project link** `https://nmsu-cs-cs371.github.io/software-development-semester-project-group-2/`
 
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
├── .github
│   └── workflows
│       └── autograde.yaml
├── data
│   ├── floors
│   ├── buildings.geojson
│   └── descriptions.json
├── js
│   ├── core
│   │   ├── config.js
│   │   ├── html.js
│   │   ├── store.js
│   │   └── waitOneFrame.js
│   ├── logic
│   │   └── mapBounds.js
│   ├── map
│   │   ├── badges.js
│   │   └── campusMap.js
│   ├── sheet
│   │   └── infoSheet.js
│   └── main.js
├── styles
│   ├── baseStyle.css
│   ├── mapStyle.css
│   └── sheetStyle.css
├── .classroom50.yaml
├── README.md
├── config.yml
└── index.html
```

## Use by NMSU
This project is coursework for CS 371. The course and the instructor may use it for class.

If New Mexico State University wants to adopt Better NMSU Maps as an official campus service, The Brainy Bunch asks for a written agreement first. That agreement should include compensation for the team, such as a stipend or scholarship. Viewing the public GitHub Pages site is not that agreement.