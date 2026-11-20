"""Read-only official gazette collection. Ambiguous OCR never publishes a result."""
import datetime as dt
import hashlib
import json
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ORIGIN = 'https://nagalandlotteries.com/'
TODAY = lambda: dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).date()


def download(url, data=None):
    if not url.startswith(ORIGIN):
        raise ValueError('UNTRUSTED_SOURCE')
    request = urllib.request.Request(url, data=data, headers={'User-Agent': 'ORBIS-Result-Reader/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if not response.url.startswith(ORIGIN):
            raise ValueError('UNTRUSTED_REDIRECT')
        content = response.read(12_000_001)
    if len(content) > 12_000_000:
        raise ValueError('SOURCE_TOO_LARGE')
    return content


def parse(text, date, slot):
    """Strict supported weekly template; no OCR character repair/guessing."""
    stamp = re.search(r'Draw Date\s*:\s*(\d{2}\.\d{2}\.\d{4})', text)
    draw = re.search(r'Draw No\s*:\s*(\d+)', text)
    clock = re.search(r'Draw Time\s*:\s*0?(\d)[.:]00\s*PM', text)
    title = re.search(r'DEAR\s+([A-Z ]+?WEEKLY LOTTERY)', text)
    if not stamp or stamp[1] != date.strftime('%d.%m.%Y') or not draw or not clock or clock[1] + 'pm' != slot or not title:
        raise ValueError('DRAW_IDENTITY_UNREADABLE')
    first = re.search(r'\b(\d{2}[A-L])\s+(\d{5})\b', text)
    if not first:
        raise ValueError('FIRST_PRIZE_UNREADABLE')
    consolation = re.search(r'Cons\. Prize.*?(?=2nd Prize)', text, re.S)
    consolation_numbers = re.findall(r'\b\d{5}\b', consolation[0]) if consolation else []
    if consolation_numbers != [first[2]]:
        raise ValueError('CONSOLATION_UNREADABLE')
    tiers = []
    for rank, ordinal, end, count, width in [(2, '2nd', '3rd', 10, 5), (3, '3rd', '4th', 10, 4), (4, '4th', '5th', 10, 4), (5, '5th', 'NOTE', 100, 4)]:
        block = re.search(ordinal + r' Prize.*?(?=' + end + ')', text, re.S)
        if not block:
            raise ValueError('TIER_UNREADABLE')
        # Ignore descriptive lines containing amounts/counts, accept whole numeric rows only.
        rows = [line.strip() for line in block[0].splitlines() if re.fullmatch(r'[\d\s]+', line.strip()) and line.strip()]
        numbers = ' '.join(rows).split()
        if len(numbers) != count or len(set(numbers)) != count or any(not re.fullmatch(r'\d{' + str(width) + '}', n) for n in numbers):
            raise ValueError('TIER_COUNT_OR_DIGITS_INVALID')
        tiers.append({'rank': rank, 'numbers': sorted(numbers)})
    return {'schema': 1, 'date': date.isoformat(), 'slot': slot, 'draw': int(draw[1]), 'name': 'Dear ' + title[1].title(), 'first': {'series': first[1], 'number': first[2]}, 'consolation': first[2], 'tiers': tiers}


def extract(pdf, date, slot, directory):
    path = directory / 'source.pdf'
    path.write_bytes(pdf)
    if not pdf.startswith(b'%PDF-'):
        raise ValueError('NOT_A_PDF')
    info = subprocess.run(['pdfinfo', str(path)], capture_output=True, text=True, check=True, timeout=30).stdout
    if not re.search(r'Pages:\s+1\s', info):
        raise ValueError('UNSUPPORTED_PAGE_COUNT')
    subprocess.run(['pdftoppm', '-r', '300', '-singlefile', '-png', str(path), str(directory / 'page')], check=True, capture_output=True, timeout=90)
    candidates = []
    for mode in ('3', '6'):
        output = subprocess.run(['tesseract', str(directory / 'page.png'), 'stdout', '--psm', mode], capture_output=True, text=True, check=True, timeout=90)
        candidates.append(parse(output.stdout, date, slot))
    if candidates[0] != candidates[1]:
        raise ValueError('OCR_READINGS_DIFFER')
    # OCR agreement is not independent verification. Keep for review; never auto-promote.
    return candidates[0]


def collect(destination, today=None):
    today = today or TODAY()
    destination.mkdir(parents=True, exist_ok=True)
    previous = json.loads((destination / 'feed.json').read_text()) if (destination / 'feed.json').exists() else {'results': []}
    minimum = (today - dt.timedelta(days=29)).isoformat()
    approved = [r for r in previous['results'] if minimum <= r['date'] <= today.isoformat()]
    pending = []
    # Download today's publications; retained approved history rolls off after 30 days.
    for offset in range(1):
        date = today - dt.timedelta(days=offset)
        try:
            html = download(ORIGIN + 'getContent.php', urllib.parse.urlencode({'id': date.strftime('%d-%m-%Y')}).encode()).decode()
        except (OSError, ValueError) as error:
            pending.append({'date': date.isoformat(), 'slot': 'all', 'reason': type(error).__name__})
            continue
        files = re.findall(r'data-id="([A-Z]{2}\d{6}\.PDF)"', html)
        for filename in files:
            slot = {'MN': '1pm', 'DG': '6pm', 'EN': '8pm'}.get(filename[:2])
            if not slot or filename[2:8] != date.strftime('%d%m%y'):
                continue
            url = ORIGIN + 'old_results/' + filename
            try:
                pdf = download(url)
                digest = hashlib.sha256(pdf).hexdigest()
                existing = next((r for r in approved if r['date'] == date.isoformat() and r['slot'] == slot), None)
                if existing and existing['officialSha256'] == digest:
                    continue
                approved = [r for r in approved if not (r['date'] == date.isoformat() and r['slot'] == slot)]
                with tempfile.TemporaryDirectory(prefix='orbis-gazette-') as temporary:
                    candidate = extract(pdf, date, slot, Path(temporary))
                candidate.update(officialUrl=url, officialSha256=hashlib.sha256(pdf).hexdigest(), verification='review-required')
                pending.append({'date': date.isoformat(), 'slot': slot, 'reason': 'INDEPENDENT_REVIEW_REQUIRED', 'candidate': candidate})
            except (ValueError, OSError, subprocess.SubprocessError) as error:
                pending.append({'date': date.isoformat(), 'slot': slot, 'reason': str(error) if isinstance(error, ValueError) else type(error).__name__})
    feed = {'schema': 1, 'updatedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'results': approved, 'pending': pending}
    path = destination / 'feed.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(feed, indent=2) + '\n')
    temporary.replace(path)


if __name__ == '__main__':
    collect(Path('public/lottery-results'))
