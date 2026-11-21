"""Validate one complete Dear API draw for private server-side matching.

No public feed, phone dataset or automatic publication is created here.
"""
import datetime as dt


class DrawJsonError(ValueError):
    pass

RULES = [('1st', 'full', 1), ('cons', 'number', 1), ('2nd', 'number', 10),
         ('3rd', 'last4', 10), ('4th', 'last4', 10), ('5th', 'last4', 100)]


def normalize_draw(value, date, slot):
    import re
    try:
        parsed = dt.datetime.strptime(date, '%d-%m-%Y')
        if parsed.strftime('%d-%m-%Y') != date or slot not in ('1pm', '6pm', '8pm'):
            raise ValueError()
        if not isinstance(value, dict) or value.get('lottery') != 'dear' or value.get('date') != date or value.get('slot') != slot:
            raise ValueError()
        if value.get('status') != 'published':
            raise DrawJsonError('DRAW_NOT_PUBLISHED')
        if value.get('ticket_format') != 'DDL5' or not isinstance(value.get('prizes'), list) or len(value['prizes']) != 6:
            raise ValueError()
        prizes = []
        for tier, match, count in RULES:
            rows = [p for p in value['prizes'] if isinstance(p, dict) and p.get('tier') == tier]
            if len(rows) != 1:
                raise ValueError()
            row = rows[0]
            numbers = row.get('numbers')
            amount = row.get('amount')
            pattern = r'(?:3[4-9]|[4-9]\d)[ABCDEGHJKL] \d{5}' if match == 'full' else (r'\d{4}' if match == 'last4' else r'\d{5}')
            if row.get('match') != match or type(row.get('count')) is not int or row['count'] != count or type(amount) is not int or amount <= 0:
                raise ValueError()
            if not isinstance(numbers, list) or len(numbers) != count or any(not isinstance(n, str) or re.fullmatch(pattern, n) is None for n in numbers) or len(set(numbers)) != count:
                raise ValueError()
            prizes.append({'tier': tier, 'match': match, 'amount': amount, 'numbers': list(numbers)})
        first = value.get('first')
        series, number = prizes[0]['numbers'][0].split(' ')
        if not isinstance(first, dict) or first.get('series') != series or first.get('number') != number or first.get('amount') != prizes[0]['amount'] or prizes[1]['numbers'] != [number]:
            raise ValueError()
        return {'schema': 1, 'date': parsed.date().isoformat(), 'slot': slot, 'source': 'sambad-api', 'prizes': prizes}
    except (ValueError, TypeError, KeyError):
        raise DrawJsonError('INCOMPLETE_OR_MISMATCHED_DRAW_JSON') from None


def fetch_draw(date, slot, token):
    from api_probe import api_get
    if not token.strip() or len(token) > 4096:
        raise DrawJsonError('TOKEN_MISSING_OR_INVALID')
    return normalize_draw(api_get('result', date, slot, token), date, slot)


def match_ticket(draw, date, slot, series, number):
    """Only validated draws may enter here; select the highest-priority tier."""
    import re
    if draw.get('date') != date or draw.get('slot') != slot:
        raise DrawJsonError('DRAW_IDENTITY_MISMATCH')
    # Revalidate even a saved private copy, never trust its schema flag alone.
    first = draw['prizes'][0]
    first_series, first_number = first['numbers'][0].split(' ')
    reconstructed = {'lottery': 'dear', 'date': dt.date.fromisoformat(date).strftime('%d-%m-%Y'), 'slot': slot,
                     'status': 'published', 'ticket_format': 'DDL5',
                     'first': {'series': first_series, 'number': first_number, 'amount': first['amount']},
                     'prizes': [dict(p, count=len(p['numbers'])) for p in draw['prizes']]}
    valid = normalize_draw(reconstructed, reconstructed['date'], slot)
    if re.fullmatch(r'(?:3[4-9]|[4-9]\d)[ABCDEGHJKL]', series) is None or re.fullmatch(r'\d{5}', number) is None:
        raise DrawJsonError('TICKET_INVALID')
    for prize in valid['prizes']:
        candidate = series + ' ' + number if prize['match'] == 'full' else number[-4:] if prize['match'] == 'last4' else number
        if candidate in prize['numbers']:
            return {'status': 'win', 'tier': prize['tier'], 'amount': prize['amount']}
    return {'status': 'no_prize'}
