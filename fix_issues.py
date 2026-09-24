import os, re

def fix(path, replacements):
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8') as f: text = f.read()
    for old, new in replacements:
        if isinstance(old, str): text = text.replace(old, new)
        else: text = re.sub(old, new, text)
    with open(path, 'w', encoding='utf-8') as f: f.write(text)

# ১. টেস্ট ফাইলের Blocker ফিক্স
fix('src/auth/AccountForm.test.tsx', [
    ('expect(status).toBeInTheDocument()', 'expect(status).not.toBeNull()')
])

# ২. model.ts এর charCodeAt ফিক্স
fix('src/accounting/model.ts', [
    ('c.charCodeAt(0) - 0x09e6', '(c.codePointAt(0) ?? 0) - 0x09e6'),
    ('c.charCodeAt(0) - 0x0966', '(c.codePointAt(0) ?? 0) - 0x0966')
])

# ৩. AccountForm.tsx এর Props এবং FormEvent ফিক্স
fix('src/auth/AccountForm.tsx', [
    ('}: Props) {', '}: Readonly<Props>) {'),
    ('React.FormEvent<HTMLFormElement>', 'React.SyntheticEvent<HTMLFormElement>'),
    ('React.FormEvent', 'React.SyntheticEvent')
])

# ৪. Accounting.tsx এর নিরাপদ ফিক্সগুলো (Regex দিয়ে)
if os.path.exists('src/accounting/Accounting.tsx'):
    with open('src/accounting/Accounting.tsx', 'r', encoding='utf-8') as f: text = f.read()
    text = text.replace('React.FormEvent', 'React.SyntheticEvent')
    text = text.replace('catch (failure)', 'catch (error_)')
    text = text.replace('returnValue = false', 'preventDefault()')
    # f.get() এবং form.get() কে String() এর ভেতর নেওয়া
    text = re.sub(r"(?<!String\()(f|form)\.get\('([^']+)'\)(\s*\?\?\s*'[^']*')?", r"String(\g<0>)", text)
    with open('src/accounting/Accounting.tsx', 'w', encoding='utf-8') as f: f.write(text)
