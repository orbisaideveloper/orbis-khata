import datetime as dt
import json
import tempfile
from contextlib import chdir
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('api_schedule', Path(__file__).with_name('api_schedule.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ScheduleSafety(unittest.TestCase):
    def at(self, hour, minute, second=0):
        return dt.datetime(2026, 11, 21, hour, minute, second, tzinfo=module.IST)

    def test_ist_windows_and_utc_conversion(self):
        for hour, slot in [(13, '1pm'), (18, '6pm'), (20, '8pm')]:
            for minute in [10, 15, 29, 30]:
                date, selected, end = module.draw_window(self.at(hour, minute).astimezone(dt.timezone.utc))
                self.assertEqual((date, selected, end.minute), ('21-11-2026', slot, 30))
            self.assertIsNone(module.draw_window(self.at(hour, 9, 59)))
            self.assertIsNone(module.draw_window(self.at(hour, 30, 1)))

    def test_late_start_no_network_and_completed_draw_no_more_retries(self):
        with patch.object(module, 'probe') as probe:
            self.assertEqual(module.collect_scheduled('test', now=lambda: self.at(13, 31))['state'], 'OUTSIDE_DRAW_WINDOW')
            probe.assert_not_called()
        with patch.object(module, 'probe', return_value={'publication': 'PDF_LINK_ONLY'}) as probe, patch.object(module, 'attach_official_link', return_value=False), patch.object(module.time, 'sleep') as pause:
            result = module.collect_scheduled('test', now=lambda: self.at(18, 15), pause=pause)
            self.assertEqual(result['state'], 'PDF_LINK_READY')
            probe.assert_called_once()
            pause.assert_not_called()

    def test_pending_poll_stops_at_deadline_and_permanent_failure_is_not_retried(self):
        times = iter([self.at(13, 29), self.at(13, 29), self.at(13, 29), self.at(13, 29, 30), self.at(13, 29, 30), self.at(13, 30), self.at(13, 30)])
        with patch.object(module, 'probe', side_effect=module.ProbeError('DRAW_NOT_PUBLISHED')) as probe, patch.object(module.time, 'sleep') as pause:
            result = module.collect_scheduled('test', now=lambda: next(times), pause=pause)
            self.assertEqual(result['state'], 'WINDOW_ENDED_WITHOUT_PDF')
            self.assertEqual(probe.call_count, 3)
            self.assertEqual([call.args[0] for call in pause.call_args_list], [30, 30])
        with patch.object(module, 'probe', side_effect=module.ProbeError('HTTP_401')) as probe:
            with self.assertRaisesRegex(module.ProbeError, 'HTTP_401'):
                module.collect_scheduled('test', now=lambda: self.at(13, 15))
            probe.assert_called_once()

    def test_clock_stall_still_has_hard_attempt_limit(self):
        with patch.object(module, 'probe', side_effect=module.ProbeError('DRAW_NOT_PUBLISHED')) as probe:
            result = module.collect_scheduled('test', now=lambda: self.at(13, 10), pause=lambda _: None)
            self.assertEqual(result['attempts'], 41)
            self.assertEqual(probe.call_count, 41)

    def test_official_index_cannot_substitute_laxmi_for_six_pm(self):
        html = b'<a data-id="DG201126.PDF">DEAR LAXMI WEEKLY</a>'
        with patch.object(module, 'download', return_value=html) as download, patch.object(module, 'verify_sikkim_pdf', return_value=False) as sikkim:
            self.assertFalse(module.attach_official_link('20-11-2026', '6pm'))
            download.assert_not_called()
            sikkim.assert_called_once_with('20-11-2026')

    def test_manual_six_and_eight_use_one_selected_date(self):
        with patch.object(module, 'india_today', return_value=dt.date(2026, 11, 21)), patch.object(module, 'probe', side_effect=[{}, {}]) as probe, patch.object(module, 'attach_official_link', return_value=False), patch.object(module.time, 'sleep'):
            result = module.collect_manual('test', '20-11-2026', ['6pm', '8pm'])
            self.assertEqual(len(result['results']), 2)
            self.assertEqual([call.args[1] for call in probe.call_args_list], ['6pm', '8pm'])
            with self.assertRaisesRegex(module.ProbeError, 'INVALID_DRAW_DATE_WINDOW'):
                module.collect_manual('test', '20-09-2026', ['6pm'])

    def test_unpublished_manual_draw_does_not_block_other_slot_or_claim_success(self):
        with patch.object(module, 'india_today', return_value=dt.date(2026, 11, 21)), patch.object(module, 'probe', side_effect=[module.ProbeError('DRAW_NOT_PUBLISHED'), {}]), patch.object(module, 'attach_official_link', return_value=False), patch.object(module.time, 'sleep'):
            result = module.collect_manual('test', '20-11-2026', ['6pm', '8pm'])
            self.assertEqual(result['results'][0]['state'], 'NOT_AVAILABLE')
            self.assertNotIn('state', result['results'][1])

    def test_verified_sikkim_form_marker_preserves_other_draws_and_sambad_link(self):
        with tempfile.TemporaryDirectory() as folder, chdir(folder):
            path = Path('public/lottery-results/documents.json')
            path.parent.mkdir(parents=True)
            original = {'schema': 1, 'documents': [{'date': '2026-11-20', 'slot': '6pm', 'sambadUrl': 'https://sambad.com/draw.pdf'}, {'date': '2026-11-20', 'slot': '8pm', 'officialUrl': 'existing'}]}
            path.write_text(json.dumps(original))
            with patch.object(module, 'verify_sikkim_pdf', return_value=True), patch.object(module, 'download') as nagaland:
                self.assertTrue(module.attach_official_link('20-11-2026', '6pm'))
                nagaland.assert_not_called()
            saved = json.loads(path.read_text())
            self.assertEqual(saved['documents'][0]['officialSource'], 'sikkim-6pm')
            self.assertEqual(saved['documents'][0]['sambadUrl'], original['documents'][0]['sambadUrl'])
            self.assertEqual(saved['documents'][1], original['documents'][1])
            before = path.read_bytes()
            with patch.object(module, 'verify_sikkim_pdf', return_value=False):
                self.assertFalse(module.attach_official_link('20-11-2026', '6pm'))
            self.assertEqual(path.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
