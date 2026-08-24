import { describe, it, expect } from 'vitest';
import { parseJsonWithRepair } from '../../utils/jsonRepair';

describe('parseJsonWithRepair', () => {
  it('returns valid JSON on the fast path without marking as repaired', () => {
    const { data, repaired } = parseJsonWithRepair('{"name": "Topic 1"}');
    expect(data).toEqual({ name: 'Topic 1' });
    expect(repaired).toBe(false);
  });

  it('fixes trailing commas in objects', () => {
    const { data, repaired } = parseJsonWithRepair('{"a": 1, "b": 2,}');
    expect(data).toEqual({ a: 1, b: 2 });
    expect(repaired).toBe(true);
  });

  it('fixes trailing commas in arrays', () => {
    const { data, repaired } = parseJsonWithRepair('[1, 2, 3,]');
    expect(data).toEqual([1, 2, 3]);
    expect(repaired).toBe(true);
  });

  it('fixes semicolons used as separators', () => {
    const { data, repaired } = parseJsonWithRepair('{"a": 1; "b": 2}');
    expect(data).toEqual({ a: 1, b: 2 });
    expect(repaired).toBe(true);
  });

  it('replaces single-quoted strings with double-quoted', () => {
    const { data, repaired } = parseJsonWithRepair("{'name': 'Topic 1'}");
    expect(data).toEqual({ name: 'Topic 1' });
    expect(repaired).toBe(true);
  });

  it('handles escaped single quotes inside single-quoted strings', () => {
    const { data, repaired } = parseJsonWithRepair("{'desc': 'it\\'s fine'}");
    expect(data).toEqual({ desc: "it's fine" });
    expect(repaired).toBe(true);
  });

  it('escapes double quotes found inside single-quoted strings', () => {
    const { data, repaired } = parseJsonWithRepair("{'desc': 'a \"real\" thing'}");
    expect(data).toEqual({ desc: 'a "real" thing' });
    expect(repaired).toBe(true);
  });

  it('fixes unquoted keys', () => {
    const { data, repaired } = parseJsonWithRepair('{name: "Topic 1", id: "t1"}');
    expect(data).toEqual({ name: 'Topic 1', id: 't1' });
    expect(repaired).toBe(true);
  });

  it('strips JS-style line comments', () => {
    const input = `{
      "name": "Topic 1" // this is a topic
    }`;
    const { data, repaired } = parseJsonWithRepair(input);
    expect(data).toEqual({ name: 'Topic 1' });
    expect(repaired).toBe(true);
  });

  it('strips JS-style block comments', () => {
    const input = `{
      /* topic name */
      "name": "Topic 1"
    }`;
    const { data, repaired } = parseJsonWithRepair(input);
    expect(data).toEqual({ name: 'Topic 1' });
    expect(repaired).toBe(true);
  });

  it('fixes missing commas between lines', () => {
    const input = `{
      "a": 1
      "b": 2
    }`;
    const { data, repaired } = parseJsonWithRepair(input);
    expect(data).toEqual({ a: 1, b: 2 });
    expect(repaired).toBe(true);
  });

  it('closes unmatched brackets', () => {
    const { data, repaired } = parseJsonWithRepair('[{"name": "Topic"}');
    expect(data).toEqual([{ name: 'Topic' }]);
    expect(repaired).toBe(true);
  });

  it('closes multiple unmatched brackets', () => {
    const { data, repaired } = parseJsonWithRepair('{"topics": [{"name": "T1"}');
    expect(data).toEqual({ topics: [{ name: 'T1' }] });
    expect(repaired).toBe(true);
  });

  it('handles a realistic malformed topic export', () => {
    const input = `{
      name: 'Core Topic',
      id: 't1',
      subTopics: [
        {
          id: 'st1';
          name: 'Sub Topic One';
          dotPoints: [
            {
              id: 'dp1',
              description: 'explain something',
              prompts: []
            },
          ]
        }
      ]
    }`;
    const { data, repaired } = parseJsonWithRepair(input);
    expect(repaired).toBe(true);
    expect(data).toEqual({
      name: 'Core Topic',
      id: 't1',
      subTopics: [
        {
          id: 'st1',
          name: 'Sub Topic One',
          dotPoints: [
            {
              id: 'dp1',
              description: 'explain something',
              prompts: [],
            },
          ],
        },
      ],
    });
  });

  it('returns null data and an error for truly broken content', () => {
    const { data, repaired, error } = parseJsonWithRepair('not json at all {{{{');
    expect(data).toBeNull();
    expect(repaired).toBe(false);
    expect(error).toBeTruthy();
  });

  it('does not mangle apostrophes inside double-quoted strings', () => {
    const { data, repaired } = parseJsonWithRepair(`{"desc": "it's a test"}`);
    expect(data).toEqual({ desc: "it's a test" });
    expect(repaired).toBe(false);
  });

  it('handles combined issues: comments + trailing commas + unquoted keys', () => {
    const input = `{
      // metadata
      name: "Topic",
      id: "t1",  /* auto-generated */
      subTopics: [],
    }`;
    const { data, repaired } = parseJsonWithRepair(input);
    expect(data).toEqual({ name: 'Topic', id: 't1', subTopics: [] });
    expect(repaired).toBe(true);
  });
});
