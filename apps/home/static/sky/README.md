# Sky data

GeoJSON celestial datasets for the Star Map app, from Olaf Frohn's
[d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3-Clause), epoch J2000:

- `constellations.lines.json` — the 89 IAU constellation line figures (MultiLineString,
  coordinates are [RA°, Dec°] with RA in −180…180)
- `constellations.json` — names (multi-language), designators, and label centre points
- `stars.6.json` — 5,044 stars to magnitude 6 (the naked-eye sky), with magnitude and
  B−V colour index; positions derived from the Hipparcos catalogue via the HYG database

Copyright (c) 2015, Olaf Frohn. Redistributed under the BSD 3-Clause license.
The sky doesn't change (at this precision): these are static assets on purpose —
no API, cached forever.
