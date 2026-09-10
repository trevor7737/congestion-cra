

# Project Instructions

## Overview Context
I am a journalist for Streetsblog NYC. I am working on a "Data Dashboard" that will help NYers stay up to date on congestion pricing and its data. I am modeling the dashboard off the contents of https://www.nytimes.com/interactive/2025/05/11/upshot/congestion-pricing.html but the UI and what not will be different. I liked the categories they covered. A model for the ui for Bus speeds for instance will be this site https://metrics.mta.info/?bus/speeds . There they have a drop down for different routes, day of week, time period and etc and have this nice graph. The fundamental difference between the data dashboard I will be creating and the NYT piece is the NYT piece does not update with new data while the dashboard will utilize apis to keep it updated.

## Overview
Create a new VS Code project, then build a single-page web application dashboard to visualize multiple urban data categories.

## Data Visualizations
Display interactive graphs for the following:

- **Bus Speeds**: Line or bar chart (by time of day or route)
- **Vehicle Counts Entering the NYC Congestion Pricing Zone**: Line or area chart (by hour/day)
- **Noise Complaints**: Bar or heatmap (by neighborhood and time)
- **Vehicle Speeds within the Congestion Pricing Zone**: Histogram or line chart


## Open Data API: Key Facts & Approach

Some of these datasets contain millions of individual entries. The Open Data API typically limits downloads to 50,000 records at a time (and may have monthly or user-based limits). To efficiently handle this:

- The application will include a pre-downloaded database with the bulk of historical data.
- The API will only be used to fetch and update newly uploaded data, not to retrieve the entire dataset each time.
- This approach ensures fast loading, avoids API rate limits, and keeps the dashboard up to date.

## Data Sources
Use these open data sources:

- [MTA Congestion Relief Zone Vehicle Entries](https://data.ny.gov/Transportation/MTA-Congestion-Relief-Zone-Vehicle-Entries-Beginni/t6yz-b64h/about_data)
- [MTA Bus Route Segment Speeds](https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-Beginning-2025/kufs-yh3x/about_data)
  - [Bus Stops Reference (Google Doc)](https://docs.google.com/spreadsheets/d/1vbo6fqCqbtbiRO2VLRuzDleNLqBEQ_HovVEYVMoB1dw/edit?usp=sharing): Contains the bus stops used to filter the data to find the routes in the zone.
- [Public Transport Overall Ridership Data](https://data.ny.gov/Transportation/MTA-Daily-Ridership-and-Traffic-Beginning-2020/sayj-mze2/about_data)
- [Noise Complaints (311 Service Requests)](https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9/about_data)
- [NYC Motor Vehicle Collisions](https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95/about_data)
- [NYC Fire Incident Dispatch Data](https://data.cityofnewyork.us/Public-Safety/Fire-Incident-Dispatch-Data/8m42-w767/about_data)

## Technical Requirements

- Use a modern JavaScript framework (e.g., **React** or **Vue**) for the UI
- Use a charting library (e.g., **Chart.js**, **D3.js**, or **Recharts**) for data visualization
- Provide a **responsive layout** for desktop and mobile
- Include a **category selector** or **tabs** to switch between data types
- Add **tooltips** and **legends** to all charts for clarity
- Fetch data directly from the open data APIs, or download and serve as static JSON if needed
- Display a **loading indicator** while data is being fetched
- Include a **brief description or headline** for each graph
- Use **accessible color schemes** and ensure charts are **screen-reader friendly**
- Add a **header** with the page title and a short introduction
- Style the page with a **clean, modern look** (e.g., using CSS modules or styled-components)
- Optionally, allow users to **filter data by date range or location**
- Ensure code is **modular, well-commented, and easy to extend** with new data categories