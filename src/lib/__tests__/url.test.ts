import { describe, it, expect } from 'vitest';
import { safeImageUrl, safeHttpUrl } from '../url';

describe('safeImageUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(safeImageUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(safeImageUrl('http://example.com/a.png')).toContain('http://example.com');
  });
  it('accepts data:image URIs only', () => {
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeImageUrl('data:text/html;base64,AAAA')).toBeNull();
  });
  it('rejects script/file schemes and junk', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('vbscript:foo')).toBeNull();
    expect(safeImageUrl('file:///etc/passwd')).toBeNull();
    expect(safeImageUrl('not a url')).toBeNull();
    expect(safeImageUrl('')).toBeNull();
    expect(safeImageUrl(42)).toBeNull();
  });
});

describe('safeHttpUrl', () => {
  it('accepts only http(s)', () => {
    expect(safeHttpUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
