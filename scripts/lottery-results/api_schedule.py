"""Bounded central PDF polling; no per-phone API polling or PDF storage."""
import datetime as dt
import json
import os
import time
from api_probe import ProbeError, india_today, probe
from collect import download, publication_links, ORIGIN
from sikkim_source import verify_sikkim_pdf
import urllib.parse

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))


def draw_window(now):
    local = now.astimezone(IST)
    for hour, slot in ((13, '1pm'), (18, '6pm'), (20, '8pm')):
        start = local.replace(hour=hour, minute=10, second=0, microsecond=0)
        end = start.replace(minute=30)
        if start <= local <= end:
            return local.date().strftime('%d-%m-%Y'), slot, end
    return None


def attach_official_link(date, slot):
    """Attach only an actual same-draw publication indexed by the government."""
    parsed = dt.datetime.strptime(date, '%d-%m-%Y').date()
    try:
        if slot == '6pm':
            if not verify_sikkim_pdf(date):
                return False
            official = {'officialSource': 'sikkim-6pm'}
        else:
            html = download(ORIGIN + 'getContent.php', urllib.parse.urlencode({'id': date}).encode()).decode()
            url = publication_links(html, parsed).get(slot)
            if not url or not download(url).startswith(b'%PDF-'):
                return False
            official = {'officialUrl': url}
        from pathlib import Path
        path = Path('public/lottery-results/documents.json')
        feed = json.loads(path.read_text())
        row = next(row for row in feed['documents'] if row['date'] == parsed.isoformat() and row['slot'] == slot)
        row.pop('officialUrl', None)
        row.pop('officialSource', None)
        row.update(official)
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(feed, indent=2) + '\n')
        temporary.replace(path)
        return True
    except (OSError, ValueError, StopIteration, ProbeError):
        # Missing government publication never substitutes another draw's PDF.
        return False


def collect_scheduled(token, now=lambda: dt.datetime.now(IST), pause=time.sleep):
    target = draw_window(now())
    if target is None:
        return {'state': 'OUTSIDE_DRAW_WINDOW'}
    date, slot, end = target
    tries = 0
    while now() <= end and tries < 41:
        tries += 1
        try:
            result = probe(date, slot, token, 'public/lottery-results/documents.json')
            official = attach_official_link(date, slot)
            return {'state': 'PDF_LINK_READY', 'attempts': tries, 'result': result, 'official_link_found': official}
        except ProbeError as error:
            if str(error) not in ('DRAW_NOT_PUBLISHED', 'PDF_NOT_AVAILABLE_OR_UNSUPPORTED_HOST', 'HTTP_404', 'RESULT_FILES_MISMATCH', 'NETWORK_OR_URL_ERROR'):
                raise
        remaining = (end - now()).total_seconds()
        if remaining < 30:
            break
        pause(30)
    return {'state': 'WINDOW_ENDED_WITHOUT_PDF', 'attempts': tries, 'date': date, 'slot': slot}


def collect_manual(token, date, slots):
    parsed = dt.datetime.strptime(date, '%d-%m-%Y').date()
    if not 0 <= (india_today() - parsed).days < 30:
        raise ProbeError('INVALID_DRAW_DATE_WINDOW')
    results = []
    for slot in slots:
        try:
            result = probe(date, slot, token, 'public/lottery-results/documents.json')
            result['official_link_found'] = attach_official_link(date, slot)
        except ProbeError as error:
            if str(error) not in ('DRAW_NOT_PUBLISHED', 'PDF_NOT_AVAILABLE_OR_UNSUPPORTED_HOST'):
                raise
            result = {'date': date, 'slot': slot, 'state': 'NOT_AVAILABLE', 'reason': str(error)}
        results.append(result)
        time.sleep(1.1)
    return {'state': 'MANUAL_CHECK_COMPLETE', 'results': results}


if __name__ == '__main__':
    try:
        token = os.environ.get('SAMBAD_API_TOKEN', '')
        if os.environ.get('DRAW_MODE') == 'scheduled':
            result = collect_scheduled(token)
        else:
            result = collect_manual(token, os.environ.get('DRAW_DATE') or (india_today() - dt.timedelta(days=1)).strftime('%d-%m-%Y'), os.environ.get('DRAW_SLOT', '6pm,8pm').split(','))
        print(json.dumps(result))
    except ProbeError as error:
        print('COLLECTION_FAILED: ' + str(error))
        raise SystemExit(1) from None
    except Exception:
        print('COLLECTION_FAILED: UNEXPECTED_RESPONSE')
        raise SystemExit(1) from None
