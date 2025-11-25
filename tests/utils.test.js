describe('utils.sanitizeInput', ()=>{
  const { sanitizeInput } = require('../js/utils.cjs');

  test('escapes HTML characters', ()=>{
    const raw = '<script>alert(1)</script>';
    const s = sanitizeInput(raw);
    expect(s).toContain('&lt;script&gt;');
    expect(s).not.toContain('<script>');
  });
  test('returns empty string for non-string', ()=>{
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(123)).toBe('');
  });
});
