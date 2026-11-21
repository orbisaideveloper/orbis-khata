import copy
import unittest
from unittest.mock import patch
from result_json import normalize_draw, match_ticket, fetch_draw, DrawJsonError as ProbeError, RULES


def fixture():
    prizes = []
    for tier, match, count in RULES:
        numbers = ['35B 00220'] if tier == '1st' else ['00220'] if tier == 'cons' else [str(n).zfill(5 if tier == '2nd' else 4) for n in range(1000, 1000 + count)]
        prizes.append({'tier': tier, 'match': match, 'amount': 120, 'count': count, 'numbers': numbers})
    return {'lottery': 'dear', 'date': '20-11-2026', 'slot': '8pm', 'status': 'published', 'ticket_format': 'DDL5', 'first': {'series': '35B', 'number': '00220', 'amount': 120}, 'prizes': prizes}


class CompleteDraw(unittest.TestCase):
    def test_one_full_draw_handles_distinct_tickets_without_further_api_calls(self):
        with patch('api_probe.api_get', return_value=fixture()) as api:
            draw = fetch_draw('20-11-2026', '8pm', 'synthetic')
            self.assertEqual(match_ticket(draw, '2026-11-20', '8pm', '35B', '00220')['tier'], '1st')
            self.assertEqual(match_ticket(draw, '2026-11-20', '8pm', '36B', '00220')['tier'], 'cons')
            self.assertEqual(match_ticket(draw, '2026-11-20', '8pm', '36B', '01000')['tier'], '2nd')
            self.assertEqual(match_ticket(draw, '2026-11-20', '8pm', '36B', '91000')['tier'], '3rd')
            self.assertEqual(match_ticket(draw, '2026-11-20', '8pm', '36B', '99999')['status'], 'no_prize')
            api.assert_called_once()
        for date, slot in [('2026-11-21', '8pm'), ('2026-11-20', '6pm')]:
            with self.assertRaises(ProbeError): match_ticket(draw, date, slot, '35B', '00220')

    def test_incomplete_duplicate_numeric_and_wrong_draw_data_never_become_no_prize(self):
        changes = [lambda p: p.update(date='21-11-2026'), lambda p: p.update(status='pending'), lambda p: p['prizes'].pop(), lambda p: p['prizes'][5]['numbers'].pop(), lambda p: p['prizes'][2].update(match='last4'), lambda p: p['prizes'][5]['numbers'].__setitem__(0, 1000), lambda p: p['prizes'][5]['numbers'].__setitem__(0, '1001'), lambda p: p['first'].update(number='99999')]
        for change in changes:
            payload = copy.deepcopy(fixture()); change(payload)
            with self.assertRaises(ProbeError): normalize_draw(payload, '20-11-2026', '8pm')

    def test_collector_reports_complete_json_without_exporting_numbers(self):
        import api_probe
        payload = fixture(); payload['files'] = {'pdf': 'https://sambad.com/result.pdf'}
        with patch('api_probe.api_get', return_value=payload), patch('api_probe.request_bytes', return_value=b'%PDF-fixture'), patch('api_probe.time.sleep'):
            report = api_probe.probe('20-11-2026', '8pm', 'fixture')
        self.assertTrue(report['complete_json_validated'])
        self.assertNotIn('prizes', report)
        self.assertNotIn('00220', str(report))

    def test_data_does_not_retain_provider_private_fields(self):
        payload = fixture(); payload['access-token'] = 'private'; payload['files'] = {'pdf': 'unexpected'}
        draw = normalize_draw(payload, '20-11-2026', '8pm')
        self.assertNotIn('access-token', draw)
        self.assertNotIn('files', draw)
        draw['prizes'][5]['numbers'].pop()
        with self.assertRaises(ProbeError): match_ticket(draw, '2026-11-20', '8pm', '35B', '99999')


if __name__ == '__main__': unittest.main()
