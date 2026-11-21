import importlib.util
import json
import unittest
import urllib.error
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('api_probe', Path(__file__).with_name('api_probe.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ApiProbeSafety(unittest.TestCase):
    def setUp(self):
        pause = patch.object(module.time, 'sleep')
        pause.start()
        self.addCleanup(pause.stop)
        today = patch.object(module, 'india_today', return_value=module.dt.date(2026, 11, 21))
        today.start()
        self.addCleanup(today.stop)

    def payload(self, **overrides):
        return {'lottery': 'dear', 'date': '20-11-2026', 'slot': '1pm', 'status': 'published', 'files': {'pdf': 'https://lottery.sambad.com/draw.pdf'}, **overrides}

    def test_one_draw_reads_api_and_pdf_without_publishing_data_or_token(self):
        responses = [json.dumps({'success': True, 'data': self.payload()}).encode()] * 2 + [b'%PDF-1.7\nfixture']
        with patch.object(module, 'request_bytes', side_effect=responses) as request:
            result = module.probe('20-11-2026', '1pm', 'synthetic-secret')
        self.assertEqual(len(result['pdfs']), 1)
        self.assertEqual(result['official_comparison'], 'NOT_PERFORMED')
        self.assertEqual(result['publication'], 'NOT_PERFORMED')
        self.assertNotIn('synthetic-secret', json.dumps(result))
        self.assertNotIn('https://', json.dumps(result))
        self.assertIn('slot=1pm', request.call_args_list[0].args[0])

    def test_missing_credential_invalid_date_and_slot_fail_before_network(self):
        with patch.object(module, 'request_bytes') as request:
            for date, slot, token in [('20-11-2026', '1pm', ''), ('31-11-2026', '1pm', 'test'), ('2026-11-20', '1pm', 'test'), ('20-11-2026', '9pm', 'test')]:
                with self.assertRaises(module.ProbeError):
                    module.probe(date, slot, token)
            request.assert_not_called()

    def test_file_urls_reject_spoofed_hosts_credentials_and_query_tokens(self):
        values = ['https://sambad.com.evil.test/x.pdf', 'http://lottery.sambad.com/x.pdf', 'https://user:pass@sambad.com/x.pdf', 'https://sambad.com/x.pdf?access-token=secret', 'https://sambad.com:444/x.pdf']
        self.assertEqual(module.pdf_links({'nested': values}), set())
        self.assertEqual(module.pdf_links(['https://lottery.sambad.com/x.pdf']), {'https://lottery.sambad.com/x.pdf'})

    def test_failed_auth_invalid_json_and_nonobject_data_fail_closed(self):
        for body in [b'HTML error', b'{"success":false,"data":{}}', b'{"success":true,"data":[]}']:
            with patch.object(module, 'request_bytes', return_value=body):
                with self.assertRaises(module.ProbeError):
                    module.api_get('result', '20-11-2026', '1pm', 'test')

    def test_missing_or_fake_pdf_cannot_pass(self):
        for files, pdf in [({}, b'%PDF-'), ({'pdf': 'https://sambad.com/x.pdf'}, b'not PDF')]:
            with patch.object(module, 'api_get', side_effect=[self.payload(), self.payload(files=files)]), patch.object(module, 'request_bytes', return_value=pdf):
                with self.assertRaises(module.ProbeError):
                    module.probe('20-11-2026', '1pm', 'test')

    def test_identity_pending_and_file_disagreement_never_publish(self):
        for payload in [self.payload(date='19-11-2026'), self.payload(slot='8pm'), self.payload(lottery='other'), self.payload(status='pending'), self.payload(files={'pdf': 'https://sambad.com/other.pdf'})]:
            with patch.object(module, 'api_get', side_effect=[self.payload(), payload]), patch.object(module, 'publish_link') as publish:
                with self.assertRaises(module.ProbeError):
                    module.probe('20-11-2026', '1pm', 'test', 'unused')
                publish.assert_not_called()

    def test_link_publication_preserves_official_and_other_draws_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'documents.json'
            original = {'schema': 1, 'documents': [{'date': '2026-11-20', 'slot': '1pm', 'officialUrl': 'official'}, {'date': '2026-11-20', 'slot': '8pm', 'officialUrl': 'evening'}]}
            path.write_text(json.dumps(original))
            with patch.object(module, 'api_get', return_value=self.payload()), patch.object(module, 'request_bytes', return_value=b'%PDF-1.7'):
                result = module.probe('20-11-2026', '1pm', 'synthetic-secret', path)
                module.probe('20-11-2026', '1pm', 'synthetic-secret', path)
            saved = json.loads(path.read_text())
            self.assertEqual(result['publication'], 'PDF_LINK_ONLY')
            self.assertEqual(len(saved['documents']), 2)
            self.assertEqual(saved['documents'][0]['officialUrl'], 'official')
            self.assertEqual(saved['documents'][1], original['documents'][1])
            self.assertNotIn('synthetic-secret', path.read_text())
            self.assertEqual(set(saved['documents'][0]), {'date', 'slot', 'officialUrl', 'sambadUrl'})
            before = path.read_bytes()
            with patch.object(module, 'api_get', return_value=self.payload()), patch.object(module, 'request_bytes', return_value=b'bad'):
                with self.assertRaises(module.ProbeError):
                    module.probe('20-11-2026', '1pm', 'test', path)
            self.assertEqual(path.read_bytes(), before)

    def test_http_errors_redact_credential_bearing_urls(self):
        error = urllib.error.HTTPError('https://api.sambad.com/?access-token=synthetic-secret', 401, 'private body', {}, None)
        opener = MagicMock()
        opener.open.side_effect = error
        with patch.object(module.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(module.ProbeError, '^HTTP_401$'):
                module.request_bytes('https://api.sambad.com/', 100)

    def test_redirect_and_oversized_response_are_refused(self):
        with self.assertRaisesRegex(module.ProbeError, 'REDIRECT_REFUSED'):
            module.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.test/')
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = b'x' * 11
        with patch.object(module.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(module.ProbeError, 'RESPONSE_TOO_LARGE'):
                module.request_bytes('https://api.sambad.com/', 10)


if __name__ == '__main__':
    unittest.main()
