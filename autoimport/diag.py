with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

content = ''.join(lines)

# Check A: Is there any throw or syntax-breaking pattern before flowItems?
flow_idx = content.rfind('flowItems.forEach')
dom_idx = content.find("document.addEventListener('DOMContentLoaded'")
before_flow = content[dom_idx:flow_idx]

# Count try/catch/finally
print('=== POTENTIAL ISSUES BEFORE flowItems.forEach ===')
print(f'throw statements: {before_flow.count("throw ")}')
print(f'return statements (top-level risk): {before_flow.count(chr(10) + "    return;")}')

# Check B: Find line number of flowItems.forEach
for i, line in enumerate(lines, 1):
    if 'flowItems.forEach' in line:
        print(f'flowItems.forEach found at line {i}: {line.strip()}')

# Check C: Find the ACTUAL addEventListener calls near flowItems
flow_line = None
for i, line in enumerate(lines, 1):
    if 'flowItems.forEach' in line:
        flow_line = i
        break

if flow_line:
    print(f'\n=== CODE AROUND LINE {flow_line} (flowItems.forEach) ===')
    for i in range(flow_line - 3, flow_line + 60):
        print(f'{i}: {lines[i-1]}', end='')

# Check D: Is there something that overwrites the click event?
print('\n=== SEARCHING FOR event.stopImmediatePropagation ===')
if 'stopImmediatePropagation' in content:
    for i, line in enumerate(lines, 1):
        if 'stopImmediatePropagation' in line:
            print(f'  Line {i}: {line.strip()}')
else:
    print('  Not found - OK')

# Check E: pointer-events in inline styles on flow-item?
print('\n=== SEARCHING FOR pointer-events none on flow containers ===')
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re
matches = re.findall(r'(flow.{0,200}pointer-events.{0,50})', html, re.DOTALL | re.IGNORECASE)
for m in matches:
    print('FOUND:', m[:200])

# Check F: Does index.html have v6 in both places?
print('\n=== CACHE VERSION CHECK ===')
for i, line in enumerate(html.split('\n'), 1):
    if 'v=2026' in line:
        print(f'  Line {i}: {line.strip()}')
