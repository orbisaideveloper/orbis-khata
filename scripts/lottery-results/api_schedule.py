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


def latest_due(now):
    local = now.astimezone(IST)
    slots = [(hour, slot) for hour, slot in ((13, '1pm'), (18, '6pm'), (20, '8pm')) if local.hour >= hour]
    return (local.date().strftime('%d-%m-%Y'), slots[-1][1]) if slots else None


def already_published(date, slot):
    from pathlib import Path
    try:
        feed = json.loads(Path('public/lottery-results/documents.json').read_text())
        iso = dt.datetime.strptime(date, '%d-%m-%Y').date().isoformat()
        return any(row.get('date') == iso and row.get('slot') == slot and row.get('sambadUrl') for row in feed['documents'])
    except (OSError, ValueError, KeyError, TypeError):
        return False


def collect_scheduled(token, now=lambda: dt.datetime.now(IST), pause=time.sleep):
    target = draw_window(now())
    if target is None:
        due = latest_due(now())
        if due is None:
            return {'state': 'OUTSIDE_DRAW_WINDOW'}
        date, slot = due
        if already_published(date, slot):
            return {'state': 'ALREADY_PUBLISHED', 'date': date, 'slot': slot}
        # A delayed GitHub job must not lose today's draw. One catch-up, no late polling.
        result = collect_manual(token, date, [slot])
        return {'state': 'LATE_SINGLE_CHECK', 'result': result}
    date, slot, end = target
    if already_published(date, slot):
        return {'state': 'ALREADY_PUBLISHED', 'date': date, 'slot': slot}
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


def manual_selection():
    date = os.environ.get('DRAW_DATE') or india_today().strftime('%d-%m-%Y')
    slots = os.environ.get('DRAW_SLOT') or 'auto'
    if slots == 'auto':
        due = latest_due(dt.datetime.now(IST))
        return date, [due[1] if due else '1pm']
    return date, slots.split(',')


if __name__ == '__main__':
    try:
        token = os.environ.get('SAMBAD_API_TOKEN', '')
        if os.environ.get('DRAW_MODE') == 'scheduled':
            result = collect_scheduled(token)
        else:
            date, slots = manual_selection()
            result = collect_manual(token, date, slots)
        print(json.dumps(result))
    except ProbeError as error:
        print('COLLECTION_FAILED: ' + str(error))
        raise SystemExit(1) from None
    except Exception:
        print('COLLECTION_FAILED: UNEXPECTED_RESPONSE')
        raise SystemExit(1) from None
