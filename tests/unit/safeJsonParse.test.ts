import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../../services/aiCore';

describe('safeJsonParse', () => {
  it('should parse valid JSON directly', () => {
    const jsonString = '{"id": "1", "name": "Test"}';
    const result = safeJsonParse<{ id: string; name: string }>(jsonString);

    expect(result).toEqual({ id: '1', name: 'Test' });
  });

  it('should handle empty string', () => {
    const result = safeJsonParse('');
    expect(result).toBeNull();
  });

  it('should handle null input', () => {
    const result = safeJsonParse(null as any);
    expect(result).toBeNull();
  });

  it('should extract JSON from markdown code blocks', () => {
    const jsonString = '```json\n{"id": "1", "name": "Test"}\n```';
    const result = safeJsonParse<{ id: string; name: string }>(jsonString);

    expect(result).toEqual({ id: '1', name: 'Test' });
  });

  it('should extract JSON from markdown code blocks without language specifier', () => {
    const jsonString = '```\n{"id": "1"}\n```';
    const result = safeJsonParse<{ id: string }>(jsonString);

    expect(result).toEqual({ id: '1' });
  });

  it('should handle JSON with escaped quotes', () => {
    const jsonString = '{"name": "Test \\"Quoted\\""}';
    const result = safeJsonParse<{ name: string }>(jsonString);

    expect(result).toEqual({ name: 'Test "Quoted"' });
  });

  it('should extract JSON from text with leading content', () => {
    const jsonString = 'Here is the response:\n{"id": "1", "status": "success"}';
    const result = safeJsonParse<{ id: string; status: string }>(jsonString);

    expect(result).toEqual({ id: '1', status: 'success' });
  });

  it('should handle nested objects', () => {
    const jsonString = '{"user": {"id": "1", "profile": {"name": "John"}}}';
    const result = safeJsonParse<any>(jsonString);

    expect(result).toEqual({
      user: { id: '1', profile: { name: 'John' } },
    });
  });

  it('should handle arrays in JSON', () => {
    const jsonString = '{"items": [{"id": "1"}, {"id": "2"}]}';
    const result = safeJsonParse<{ items: Array<{ id: string }> }>(jsonString);

    expect(result).toEqual({
      items: [{ id: '1' }, { id: '2' }],
    });
  });

  it('should return null for completely invalid JSON', () => {
    const jsonString = 'This is not JSON at all and has no {} structures';
    const result = safeJsonParse(jsonString);

    expect(result).toBeNull();
  });

  it('should extract JSON when preceded by thinking trace', () => {
    const jsonString = `
    <thinking>
    Let me analyze this: { "broken": "structure"
    </thinking>
    {"result": "valid", "score": 85}
    `;
    const result = safeJsonParse<{ result: string; score: number }>(jsonString);

    expect(result?.result).toBe('valid');
    expect(result?.score).toBe(85);
  });

  it('should extract JSON arrays from standalone lines after model prose', () => {
    const jsonString = `Here are the generated keywords:\n["analysis", "evidence", "judgement"]`;
    const result = safeJsonParse<string[]>(jsonString);

    expect(result).toEqual(['analysis', 'evidence', 'judgement']);
  });

  it('should preserve data types in parsed JSON', () => {
    const jsonString = '{"count": 42, "enabled": true, "rate": 3.14, "nullable": null}';
    const result = safeJsonParse<any>(jsonString);

    expect(result.count).toBe(42);
    expect(result.enabled).toBe(true);
    expect(result.rate).toBe(3.14);
    expect(result.nullable).toBeNull();
  });
});
