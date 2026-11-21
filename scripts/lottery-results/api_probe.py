"""One-draw API probe; optional publication contains only public PDF link metadata."""
import datetime as dt
import hashlib
import json
import os
import time
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request


class ProbeError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProbeError('REDIRECT_REFUSED')


def request_bytes(url, maximum):
    try:
        request = urllib.request.Request(url, headers={'Accept': 'application/json, application/pdf', 'User-Agent': 'ORBIS-Result-Probe/1.0'})
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
            data = response.read(maximum + 1)
    except urllib.error.HTTPError as error:
        # HTTPError includes the credential-bearing URL; do not print it or response body.
        raise ProbeError('HTTP_' + str(error.code)) from None
    except (OSError, ValueError):
        raise ProbeError('NETWORK_OR_URL_ERROR') from None
    if len(data) > maximum:
        raise ProbeError('RESPONSE_TOO_LARGE')
    return data


def api_get(operation, date, slot, token):
    query = urllib.parse.urlencode({'date': date, 'slot': slot, 'access-token': token})
    raw = request_bytes('https://api.sambad.com/v2/dear/' + operation + '?' + query, 2_000_000)
    try:
        result = json.loads(raw)
    except (ValueError, UnicodeError):
        raise ProbeError('INVALID_JSON') from None
    if not isinstance(result, dict) or result.get('success') is not True or not isinstance(result.get('data'), dict):
        raise ProbeError('UNSUPPORTED_API_RESPONSE')
    return result['data']


def pdf_links(value):
    """Select only public Sambad HTTPS PDF links; never follow arbitrary response URLs."""
    links = set()
    if isinstance(value, dict):
        for child in value.values():
            links.update(pdf_links(child))
    elif isinstance(value, list):
        for child in value:
            links.update(pdf_links(child))
    elif isinstance(value, str):
        parsed = urllib.parse.urlsplit(value)
        host = parsed.hostname or ''
        if parsed.scheme == 'https' and (host == 'sambad.com' or host.endswith('.sambad.com')) and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment and parsed.port in (None, 443) and parsed.path.lower().endswith('.pdf'):
            links.add(value)
    return links


def probe(date, slot, token, publish_path=None):
    if not token or not token.strip() or len(token) > 4096:
        raise ProbeError('TOKEN_MISSING_OR_INVALID')
    try:
        parsed_date = dt.datetime.strptime(date, '%d-%m-%Y').date()
        if parsed_date.strftime('%d-%m-%Y') != date:
            raise ValueError()
    except ValueError:
        raise ProbeError('INVALID_DRAW_DATE') from None
    if slot not in ('1pm', '6pm', '8pm'):
        raise ProbeError('INVALID_DRAW_SLOT')
    result = api_get('result', date, slot, token)
    time.sleep(1.1)  # Provider limit: at most one API request per second.
    files = api_get('files', date, slot, token)
    for payload in (result, files):
        if payload.get('lottery') != 'dear' or payload.get('date') != date or payload.get('slot') != slot:
            raise ProbeError('DRAW_IDENTITY_MISMATCH')
        if payload.get('status') != 'published':
            raise ProbeError('DRAW_NOT_PUBLISHED')
    links = pdf_links(files.get('files'))
    if links != pdf_links(result.get('files')):
        raise ProbeError('RESULT_FILES_MISMATCH')
    if not links:
        raise ProbeError('PDF_NOT_AVAILABLE_OR_UNSUPPORTED_HOST')
    if len(links) != 1:
        raise ProbeError('AMBIGUOUS_PDF_LINKS')
    documents = []
    for url in sorted(links):
        content = request_bytes(url, 12_000_000)
        if not content.startswith(b'%PDF-'):
            raise ProbeError('INVALID_PDF')
        documents.append({'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
    if publish_path is not None:
        publish_link(publish_path, parsed_date.isoformat(), slot, next(iter(links)))
    # Inspect the already-received full result privately; never publish its dataset.
    from result_json import normalize_draw, DrawJsonError
    try:
        normalize_draw(result, date, slot)
        complete_json_validated = True
    except DrawJsonError:
        complete_json_validated = False
    # No raw response, token, winning numbers or private fields in logs.
    return {'probe': 'API_AND_PDF_RETRIEVED', 'date': date, 'slot': slot, 'result_object_received': bool(result), 'complete_json_validated': complete_json_validated, 'pdfs': documents, 'official_comparison': 'NOT_PERFORMED', 'publication': 'PDF_LINK_ONLY' if publish_path is not None else 'NOT_PERFORMED'}


def india_today():
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).date()


def publish_link(path, date, slot, url):
    """Atomic replacement of one draw's public PDF link; never stores provider JSON."""
    path = Path(path)
    feed = json.loads(path.read_text())
    if feed.get('schema') != 1 or not isinstance(feed.get('documents'), list) or len(feed['documents']) > 90:
        raise ProbeError('INVALID_DOCUMENT_MANIFEST')
    today = india_today()
    try:
        records = [row for row in feed['documents'] if 0 <= (today - dt.date.fromisoformat(row['date'])).days < 30]
    except (KeyError, TypeError, ValueError):
        raise ProbeError('INVALID_DOCUMENT_MANIFEST') from None
    feed['documents'] = records
    matches = [row for row in records if row.get('date') == date and row.get('slot') == slot]
    if len(matches) > 1:
        raise ProbeError('DUPLICATE_DOCUMENT_DRAW')
    if matches:
        matches[0]['sambadUrl'] = url
    else:
        records.append({'date': date, 'slot': slot, 'sambadUrl': url})
    if len(records) > 90:
        raise ProbeError('DOCUMENT_WINDOW_FULL')
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(feed, indent=2) + '\n')
    temporary.replace(path)


if __name__ == '__main__':
    try:
        print(json.dumps(probe(os.environ.get('DRAW_DATE', ''), os.environ.get('DRAW_SLOT', ''), os.environ.get('SAMBAD_API_TOKEN', ''), 'public/lottery-results/documents.json' if os.environ.get('PUBLISH_PDF_LINK') == '1' else None)))
    except ProbeError as error:
        print('PROBE_FAILED: ' + str(error))
        raise SystemExit(1) from None
    except Exception:
        # Last-resort redaction for malformed/unexpected provider responses.
        print('PROBE_FAILED: UNEXPECTED_RESPONSE')
        raise SystemExit(1) from None
