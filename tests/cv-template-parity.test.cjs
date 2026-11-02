const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('./helpers/load-ts.cjs');

const { applyAtsTemplateStyle } = loadTs('src/features/cv-generator/rendering/ats-template-style.ts');
const template = fs.readFileSync('public/templates/template.html', 'utf8');
const variants = [
  { id: 'classic', pageMargin: '0.4in', heading: '#000000', accent: '#000000' },
  { id: 'modern', pageMargin: '0.4in', heading: '#1e3a8a', accent: '#2563eb' },
  { id: 'compact', pageMargin: '0.3in', heading: '#000000', accent: '#555555' },
];

test('the shared template preserves semantic heading order and configured styles for every catalog variant', () => {
  const headingOrder = [...template.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(([, level]) => level).join(',');
  assert.match(template, /font-family\s*:/i);
  assert.match(template, /(?:padding|margin)\s*:/i);
  assert.doesNotMatch(template, /<(?:table|img)\b/i);

  for (const variant of variants) {
    const result = applyAtsTemplateStyle(template, variant.id, {
      pageMargin: variant.pageMargin, headingColor: variant.heading, accentColor: variant.accent,
    });
    assert.equal(result.pageMargin, variant.pageMargin);
    assert.match(result.html, new RegExp(`body class="ats-template--${variant.id}"`));
    assert.ok(result.html.includes(`color: ${variant.heading}`));
    assert.ok(result.html.includes(`border-bottom-color: ${variant.accent}`));
    assert.equal([...result.html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(([, level]) => level).join(','), headingOrder);
  }
});
