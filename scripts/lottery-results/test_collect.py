import datetime as dt
import importlib.util
import json
import unittest
import tempfile
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class ReaderSafety(unittest.TestCase):
    def setUp(self):
        self.sample = json.loads(Path('src/lottery-results/sample-2026-11-20.json').read_text())
        self.text = 'Draw Date : 20.11.2026 DEAR VICTORY FRIDAY WEEKLY LOTTERY Draw No: 55\nDraw Time: 01.00 PM\n35B 45879\nCons. Prize\n45879\n'
        for tier, ordinal in zip(self.sample['tiers'], ['2nd', '3rd', '4th', '5th']):
            self.text += ordinal + ' Prize\n' + ' '.join(tier['numbers']) + '\n'
        self.text += 'NOTE: end'

    def test_exact_numbers_and_leading_zeros(self):
        result = collector.parse(self.text, dt.date(2026, 11, 20), '1pm')
        self.assertEqual(result['tiers'], self.sample['tiers'])
        self.assertEqual(result['first'], self.sample['first'])

    def test_wrong_identity_is_blocked(self):
        for date, slot in [(dt.date(2026, 11, 19), '1pm'), (dt.date(2026, 11, 20), '6pm')]:
            with self.assertRaisesRegex(ValueError, 'DRAW_IDENTITY'):
                collector.parse(self.text, date, slot)

    def test_ocr_damage_duplicate_and_missing_number_are_blocked(self):
        for bad in ['OO22', '002', '0812', '']:
            with self.assertRaises(ValueError):
                collector.parse(self.text.replace('0022', bad), dt.date(2026, 11, 20), '1pm')

    def test_failed_download_keeps_previous_approved_result(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'feed.json').write_text(json.dumps({'results': [self.sample]}))
            with patch.object(collector, 'download', side_effect=OSError('offline')):
                collector.collect(path, dt.date(2026, 11, 20))
            result = json.loads((path / 'feed.json').read_text())
            self.assertEqual(result['results'], [self.sample])
            self.assertEqual(result['pending'][0]['reason'], 'OSError')

    def test_changed_source_is_quarantined_and_old_results_expire(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            expired = dict(self.sample, date='2026-10-21')
            (path / 'feed.json').write_text(json.dumps({'results': [self.sample, expired]}))
            html = b'<a data-id="MN201126.PDF">1 PM</a>'
            with patch.object(collector, 'download', side_effect=[html, b'%PDF-new']), patch.object(collector, 'extract', side_effect=ValueError('OCR_READINGS_DIFFER')):
                collector.collect(path, dt.date(2026, 11, 20))
            result = json.loads((path / 'feed.json').read_text())
            self.assertEqual(result['results'], [])
            self.assertEqual(result['pending'][0]['reason'], 'OCR_READINGS_DIFFER')

    def test_untrusted_download_is_blocked(self):
        with self.assertRaisesRegex(ValueError, 'UNTRUSTED_SOURCE'):
            collector.download('https://example.com/private.pdf')


if __name__ == '__main__':
    unittest.main()
