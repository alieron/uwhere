# UWhere

See where friends have class at the University of Waterloo throughout the week.

Paste the complete text from **Quest -> Class Schedule -> List View** to add a timetable. UWhere parses recurring class meetings in the browser, stores only the normalized term and schedule locally, and maps active classes using University of Waterloo building data. No backend or API key is required.

## Features

- Browse schedules by day and time
- Show active class buildings on an interactive MapLibre map using OpenFreeMap
- Keep names, colours, and parsed schedules in local storage
- Import current Quest List View text and older UWFlow-formatted schedules

Building coordinates in `public/data/buildings.json` are generated from the University of Waterloo [Buildings dataset](https://github.com/uwaterloo/Datasets/blob/master/Buildings/Buildings.json).
