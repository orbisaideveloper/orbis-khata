"""Read the official Sikkim Dear 6 PM archive form, without storing PDFs."""
import datetime as dt
import urllib.parse
import urllib.request
from api_probe import NoRedirect

SIKKIM_ARCHIVE = 'https://www.sikkimlotteries.com/old_result.php'


def verify_sikkim_pdf(date):
    parsed = dt.datetime.strptime(date, '%d-%m-%Y').date()
    if parsed.strftime('%d-%m-%Y') != date:
        raise ValueError('INVALID_SIKKIM_DATE')
    fields = urllib.parse.urlencode({'deardbpdf': parsed.strftime('%d/%m/%Y'), 'deardb_pdf_btn': 'Download'}).encode()
    request = urllib.request.Request(SIKKIM_ARCHIVE, data=fields, headers={'User-Agent': 'ORBIS-Result-Reader/1.0'})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
        # This endpoint streams a PDF after a POST; the GET page is only its date form.
        if response.headers.get_filename() != 'DN' + parsed.strftime('%d%m%y') + '.PDF':
            return False
        if response.headers.get_content_type() != 'application/pdf':
            return False
        content = response.read(12_000_001)
    return len(content) <= 12_000_000 and content.startswith(b'%PDF-')
