"""
This file & what it does: checks tools/build_places.py without the internet, using a made-up answer shaped like NMSU's.
Why we have it: the lot data is only downloaded by hand, so the code that reads it must be proven first.
Run it with: python3 -m unittest tests/test_build_places.py
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'tools'))
import build_places  # noqa: E402

SQUARE = {'type': 'Polygon', 'coordinates': [[[-106.76, 32.28], [-106.759, 32.28], [-106.759, 32.281], [-106.76, 32.281], [-106.76, 32.28]]]}
# an L-shape: its area centre sits outside the shape, so the point must still land inside
L_SHAPE = {'type': 'Polygon', 'coordinates': [[[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10], [0, 0]]]}


def lot(object_id, name, color, rule, geometry=SQUARE, campus='LAS CRUCES', street='1040 S HORSESHOE', city='LAS CRUCES'):
    """One feature shaped like NMSU's Parking layer answer."""
    return {'type': 'Feature', 'geometry': geometry,
            'properties': {'OBJECTID': object_id, 'LotName': name, 'TYPE': color, 'COMMENTS': rule,
                           'CAMPUS': campus, 'FULLADDR': street, 'BLDG_CITY': city}}


class BuildPlacesTest(unittest.TestCase):
    def test_lot_names_keep_numbers_and_fill_blanks(self):
        self.assertEqual(build_places.parking_name('LOT 79H'), 'Lot 79H')
        self.assertEqual(build_places.parking_name(' '), 'Parking lot')
        self.assertEqual(build_places.parking_name(None), 'Parking lot')

    def test_permit_facts_use_none_when_nmsu_gives_none(self):
        self.assertEqual(build_places.permit_color({'TYPE': 'Purple'}), 'Purple')
        self.assertIsNone(build_places.permit_color({'TYPE': 'No Type'}))
        self.assertIsNone(build_places.permit_color({}))
        self.assertEqual(build_places.permit_rule({'COMMENTS': 'Free Parking'}), 'Free Parking')
        self.assertIsNone(build_places.permit_rule({'COMMENTS': 'N/A'}))

    def test_addresses_are_tidied(self):
        self.assertEqual(build_places.tidy_address('1040 S HORSESHOE'), '1040 S Horseshoe')

    def test_point_is_inside_even_for_an_l_shape(self):
        x, y = build_places.point_inside(L_SHAPE)
        self.assertTrue(build_places.inside_ring(L_SHAPE['coordinates'][0], x, y))
        x, y = build_places.point_inside(SQUARE)
        self.assertTrue(build_places.inside_ring(SQUARE['coordinates'][0], x, y))

    def test_lots_become_records_and_outlines(self):
        layer = {'features': [lot(7, 'LOT 2', 'Orange', 'All Permits Valid'), lot(3, ' ', None, None, campus='ALAMOGORDO', street=' ', city=' ')]}
        records, outlines = build_places.build_lots(layer)
        self.assertEqual([r['properties']['id'] for r in records], ['parking-3', 'parking-7'])  # steady order
        first = records[1]['properties']
        self.assertEqual(first['category'], 'parking')
        self.assertEqual(first['floors'], [])
        self.assertEqual(first['permitColor'], 'Orange')
        self.assertEqual(first['address'], '1040 S Horseshoe, Las Cruces, NM')
        self.assertEqual(first['campus'], 'Las Cruces main campus')
        blank = records[0]['properties']
        self.assertEqual(blank['name'], 'Parking lot')
        self.assertEqual(blank['address'], '')
        self.assertIsNone(blank['permitColor'])
        self.assertEqual(outlines[1]['properties']['id'], 'parking-7')
        self.assertEqual(outlines[1]['properties']['permitColor'], 'Orange')

    def test_a_lot_with_no_outline_is_skipped(self):
        layer = {'features': [dict(lot(1, 'LOT 1', 'Blue', None), geometry=None)]}
        self.assertEqual(build_places.build_lots(layer), ([], []))

    def test_parks_have_no_floors_and_a_map_link(self):
        parks = build_places.build_parks(json.loads(build_places.PARKS_SOURCE.read_text(encoding='utf-8')))
        self.assertEqual(len(parks), 12)
        for park in parks:
            info = park['properties']
            self.assertEqual(info['category'], 'park')
            self.assertEqual(info['floors'], [])
            self.assertTrue(info['nmsuUrl'].startswith('https://map.nmsu.edu/'))


if __name__ == '__main__':
    unittest.main()
