import importlib.util
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('sikkim_source', Path(__file__).with_name('sikkim_source.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SikkimSourceSafety(unittest.TestCase):
    def response(self, filename='DN201126.PDF', content_type='application/pdf', content=b'%PDF-1.4\nfixture'):
        headers = Message()
        headers['Content-Disposition'] = 'attachment; filename="' + filename + '"'
        headers['Content-Type'] = content_type
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.headers = headers
        opener.open.return_value.__enter__.return_value.read.return_value = content
        return opener

    def test_selected_date_uses_the_observed_six_pm_form_not_four_pm(self):
        opener = self.response()
        with patch.object(module.urllib.request, 'build_opener', return_value=opener):
            self.assertTrue(module.verify_sikkim_pdf('20-11-2026'))
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, module.SIKKIM_ARCHIVE)
        self.assertEqual(request.get_method(), 'POST')
        self.assertIn(b'deardbpdf=20%2F11%2F2026', request.data)
        self.assertNotIn(b'dearlabha4pdf', request.data)
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 25)

    def test_wrong_date_or_four_pm_pdf_is_not_accepted(self):
        for filename in ['DN191126.PDF', 'SL201126.PDF', 'DN201126.PDF.exe']:
            with patch.object(module.urllib.request, 'build_opener', return_value=self.response(filename=filename)):
                self.assertFalse(module.verify_sikkim_pdf('20-11-2026'))

    def test_html_fake_pdf_or_oversized_file_is_not_accepted(self):
        for content_type, content in [('text/html', b'%PDF-'), ('application/pdf', b'<html>missing</html>'), ('application/pdf', b'%PDF-' + b'x' * 12000000)]:
            with patch.object(module.urllib.request, 'build_opener', return_value=self.response(content_type=content_type, content=content)):
                self.assertFalse(module.verify_sikkim_pdf('20-11-2026'))

    def test_invalid_date_fails_before_network(self):
        with patch.object(module.urllib.request, 'build_opener') as opener:
            for date in ['2026-11-20', '31-11-2026', '1-11-2026']:
                with self.assertRaises(ValueError):
                    module.verify_sikkim_pdf(date)
            opener.assert_not_called()


if __name__ == '__main__':
    unittest.main()
