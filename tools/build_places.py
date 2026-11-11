"""
tools/build_places.py - makes data/places.geojson and data/parking-lots.geojson:
                        the places on the map that are not buildings (parks and parking lots).

WHAT IT DOES : Writes every place in the same shape as a building record in data/buildings.geojson,
               so the map, search, info sheet and directions treat them the same. "category" tells them apart.
                 park    : tools/parks.json (outdoor spaces on NMSU's official campus map). No internet needed.
                 parking : downloaded from NMSU Facilities GIS (the official "Parking" layer): every lot NMSU
                           maps, with its outline, name, permit colour and who can park.
               Lots and parks have no floors, so they have no floor plan.
DEPENDS ON   : Python 3 only (no extra packages). Internet for the parking lots.
READS        : tools/parks.json, and NMSU Facilities GIS (or a saved answer: --lots-file)
WRITES       : data/places.geojson          one record per park and lot (a point each)
               data/parking-lots.geojson    the lot outlines. Big, so the app only loads it when Parking is switched on.
RUN          : python3 tools/build_places.py              parks and lots (needs internet)
               python3 tools/build_places.py --parks-only parks only, offline; lots already in the file are kept
               python3 tools/build_places.py --lots-file saved.json   lots from a saved copy of NMSU's answer
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
PARKS_SOURCE = PROJECT / 'tools' / 'parks.json'
PLACES_OUTPUT = PROJECT / 'data' / 'places.geojson'
PARKING_OUTPUT = PROJECT / 'data' / 'parking-lots.geojson'
NMSU_MAP_LINK = 'https://map.nmsu.edu/?id=1888#!m/'
PARKING_LAYER = ('https://services6.arcgis.com/r7ZUBDL24w5VsBnN/arcgis/rest/services/'
                 'roads7252025/FeatureServer/17')
LOT_QUERY = (PARKING_LAYER + '/query?where=1%3D1&outFields=OBJECTID,LotName,TYPE,COMMENTS,CAMPUS,FULLADDR,BLDG_CITY'
             '&outSR=4326&f=geojson')
NO_FLOORS = 'Outdoor place: no floor plan'

# How NMSU's parking layer writes each campus -> how we show it.
CAMPUS_NAMES = {
    'LAS CRUCES': 'Las Cruces main campus',
    'ALAMOGORDO': 'NMSU Alamogordo',
    'CARLSBAD': 'NMSU Carlsbad',
    'DACC ESPINA': 'DACC Espina campus (Las Cruces)',
    'DACC EAST MESA': 'DACC East Mesa campus (Las Cruces)',
    'DACC SUNLAND PARK': 'DACC Sunland Park',
    'DACC GADSDEN': 'DACC Gadsden (Anthony)',
    'DACC CHAPARRAL': 'DACC Chaparral',
}

PLACES_NOTE = [
    'Made by tools/build_places.py. Do not edit by hand: edit tools/parks.json, then run python3 tools/build_places.py',
    '(parking lots are downloaded from NMSU Facilities GIS).',
    'Format: the same as data/buildings.geojson: a "buildings" list, one record per place, each with a Point.',
    'category is "park" or "parking". floors is always empty: a park or a lot has no floor plan.',
    'Parking lots also have permitColor (e.g. "Purple"), permitRule (who can park, as NMSU writes it,',
    'e.g. "Commuter Student" or "Free Parking") and campus. A missing fact is null: nothing is guessed.',
]
PARKING_NOTE = [
    'Made by tools/build_places.py from NMSU Facilities GIS (Parking layer). Do not edit by hand.',
    'Format: GeoJSON. One Feature per parking lot: properties {"id", "category", "name", "permitColor"} and its outline.',
    'Drawn on the map while the Parking filter is on.',
]


def download_json(url):
    """Download a JSON answer from a web address."""
    request = urllib.request.Request(url, headers={'User-Agent': 'BetterNMSUMaps-build/1.0'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def read_json(path):
    """Read a JSON file."""
    with open(path, encoding='utf-8') as handle:
        return json.load(handle)


def write_json(path, note, body, style):
    """Write a JSON file that starts with a "//" note. style is 'pretty' or 'compact'."""
    content = {'type': body['type'], '//': note}
    for key in body:
        if key != 'type':
            content[key] = body[key]
    if style == 'pretty':
        text = json.dumps(content, indent=1, ensure_ascii=False)
    else:
        text = json.dumps(content, separators=(',', ':'), ensure_ascii=False)
    Path(path).write_text(text + '\n', encoding='utf-8')


def tidy_address(street):
    """ "1040 S HORSESHOE ST" -> "1040 S Horseshoe St". Numbers, directions and suffixes stay readable."""
    words = []
    for word in street.split():
        if any(character.isdigit() for character in word):
            words.append(word.lower() if re.fullmatch(r'\d+(ST|ND|RD|TH)', word.upper()) else word)
        elif len(word.rstrip('.')) == 1:
            words.append(word.upper())
        else:
            words.append(word.capitalize())
    return ' '.join(words)


def parking_name(lot_name):
    """ "LOT 79H" -> "Lot 79H". A lot with no published name (NMSU sometimes writes just a space) is a parking lot."""
    lot_name = (lot_name or '').strip()
    if not lot_name:
        return 'Parking lot'
    words = []
    for word in lot_name.split():
        if any(character.isdigit() for character in word):
            words.append(word)  # lot numbers like 79H stay as they are
        else:
            words.append(word.capitalize())
    return ' '.join(words)


def permit_color(properties):
    """The lot's permit colour as NMSU's layer writes it ("Purple", "Orange", ...), or None when it gives none."""
    color = properties.get('TYPE')
    if not color or color == 'No Type':
        return None
    return color


def permit_rule(properties):
    """Who can park, as NMSU's layer writes it ("All Permits Valid", "Free Parking", ...), or None."""
    rule = properties.get('COMMENTS')
    if not rule or rule == 'N/A':
        return None
    return rule


def ring_area_centre(ring):
    """The middle of a ring by area (shoelace formula), or the average of its corners when it has no area."""
    area = 0.0
    x_sum = 0.0
    y_sum = 0.0
    for index in range(len(ring) - 1):
        x1, y1 = ring[index][0], ring[index][1]
        x2, y2 = ring[index + 1][0], ring[index + 1][1]
        cross = x1 * y2 - x2 * y1
        area += cross
        x_sum += (x1 + x2) * cross
        y_sum += (y1 + y2) * cross
    if abs(area) < 1e-18:
        return [sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)]
    return [x_sum / (3 * area), y_sum / (3 * area)]


def inside_ring(ring, x, y):
    """Is (x, y) inside the ring? A ray to the right crosses an odd number of edges when it is."""
    result = False
    for index in range(len(ring) - 1):
        x1, y1 = ring[index][0], ring[index][1]
        x2, y2 = ring[index + 1][0], ring[index + 1][1]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            result = not result
    return result


def point_inside(geometry):
    """A [lng, lat] that is always inside the lot: its centre if that is inside, else the middle of a wide row."""
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    ring = max((polygon[0] for polygon in polygons), key=len)  # the biggest piece
    centre = ring_area_centre(ring)
    if inside_ring(ring, centre[0], centre[1]):
        return centre
    ys = sorted(point[1] for point in ring)
    y = (ys[0] + ys[-1]) / 2
    crossings = []
    for index in range(len(ring) - 1):
        x1, y1 = ring[index][0], ring[index][1]
        x2, y2 = ring[index + 1][0], ring[index + 1][1]
        if (y1 > y) != (y2 > y):
            crossings.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
    crossings.sort()
    best = None
    for index in range(0, len(crossings) - 1, 2):
        if best is None or crossings[index + 1] - crossings[index] > best[1] - best[0]:
            best = (crossings[index], crossings[index + 1])
    if best is None:
        return ring[0]
    return [(best[0] + best[1]) / 2, y]


def place_record(place_id, category, name, kind, source, point):
    """A place in the same shape as a building record in data/buildings.geojson."""
    return {
        'type': 'Building',
        'properties': {
            'id': place_id,
            'code': '',
            'name': name,
            'address': '',
            'propertyNumber': '',
            'built': '',
            'builtSource': '',
            'floors': [],
            'floorsSource': NO_FLOORS,
            'category': category,
            'kind': kind,
            'nmsuUrl': '',
            'source': source,
            'codeSource': 'Not listed by the NMSU Registrar',
        },
        'geometry': {'type': 'Point', 'coordinates': [round(point[0], 7), round(point[1], 7)]},
    }



def build_parks(parks_file):
    """Every park in tools/parks.json, as place records."""
    records = []
    for park in parks_file['parks']:
        map_id = str(park['concept3dId'])
        record = place_record('park-' + map_id, 'park', park['name'], park['kind'],
                              "Location from NMSU's official campus map (map.nmsu.edu).", [park['lng'], park['lat']])
        record['properties']['nmsuUrl'] = NMSU_MAP_LINK + map_id
        records.append(record)
    return records


def build_lots(layer):
    """Lots from NMSU Facilities GIS's Parking layer: (place records, outline features)."""
    records = []
    outlines = []
    for lot in sorted(layer['features'], key=lambda item: item['properties']['OBJECTID']):
        properties = lot['properties']
        if not lot.get('geometry'):
            continue  # a lot with no outline cannot be drawn or reached
        lot_id = 'parking-' + str(properties['OBJECTID'])
        name = parking_name(properties.get('LotName'))
        record = place_record(lot_id, 'parking', name, 'Parking lot',
                              'Lot outline, name and permit from NMSU Facilities GIS (Parking layer).',
                              point_inside(lot['geometry']))
        info = record['properties']
        info['permitColor'] = permit_color(properties)
        info['permitRule'] = permit_rule(properties)
        info['campus'] = CAMPUS_NAMES.get(properties.get('CAMPUS'))
        # NMSU's layer writes a single space when a lot has no street address: then the page shows its campus.
        street = (properties.get('FULLADDR') or '').strip()
        city = (properties.get('BLDG_CITY') or '').strip()
        if street and city:
            info['address'] = tidy_address(street) + ', ' + city.title() + ', NM'
        records.append(record)
        outlines.append({'type': 'Feature',
                         'properties': {'id': lot_id, 'category': 'parking', 'name': name,
                                        'permitColor': info['permitColor']},
                         'geometry': lot['geometry']})
    return records, outlines


def lots_already_written():
    """The lot records and outlines from the last run, so a parks-only run does not lose them."""
    if not (PLACES_OUTPUT.exists() and PARKING_OUTPUT.exists()):
        return [], []
    records = [record for record in read_json(PLACES_OUTPUT)['buildings'] if record['properties']['category'] == 'parking']
    return records, read_json(PARKING_OUTPUT)['features']


def main(arguments):
    """Write every park and parking lot, and the lot outlines."""
    parks = build_parks(read_json(PARKS_SOURCE))
    print(len(parks), 'parks done')
    if '--parks-only' in arguments:
        lots, outlines = lots_already_written()
        print(len(lots), 'parking lots kept from the last run')
    else:
        if '--lots-file' in arguments:
            layer = read_json(arguments[arguments.index('--lots-file') + 1])
        else:
            layer = download_json(LOT_QUERY)
        lots, outlines = build_lots(layer)
        print(len(lots), 'parking lots done')
    write_json(PLACES_OUTPUT, PLACES_NOTE, {'type': 'Buildings', 'buildings': parks + lots}, 'compact')
    write_json(PARKING_OUTPUT, PARKING_NOTE, {'type': 'FeatureCollection', 'features': outlines}, 'compact')
    print(len(parks) + len(lots), 'places written to', PLACES_OUTPUT)


if __name__ == '__main__':
    main(sys.argv[1:])
