import { describe, it, expect } from 'vitest';
import { parseSubItemsFromDescription } from '../../utils/dataManagerUtils';

describe('parseSubItemsFromDescription', () => {
  it('extracts items from "including X, Y, and Z" pattern', () => {
    const result = parseSubItemsFromDescription(
      'Explore models of training ML including supervised, unsupervised, semi-supervised, and reinforcement learning'
    );
    expect(result).toContain('supervised');
    expect(result).toContain('unsupervised');
    expect(result).toContain('semi-supervised');
    expect(result).toContain('reinforcement learning');
  });

  it('extracts items from "including X and Y" pattern', () => {
    const result = parseSubItemsFromDescription(
      'Investigate the effect of big data on web architecture including data mining'
    );
    expect(result).toContain('data mining');
  });

  it('extracts items from multi-item "including" with commas and "and"', () => {
    const result = parseSubItemsFromDescription(
      'Assess the impact of automation on the individual, society and the environment including safety, disability, skills, efficiency, waste, and wealth distribution'
    );
    expect(result).toContain('safety');
    expect(result).toContain('disability');
    expect(result).toContain('skills');
    expect(result).toContain('efficiency');
    expect(result).toContain('waste');
    expect(result).toContain('wealth distribution');
  });

  it('extracts items from "such as" pattern', () => {
    const result = parseSubItemsFromDescription(
      'Apply security features such as data protection, security, and privacy'
    );
    expect(result).toContain('data protection');
    expect(result).toContain('security');
    expect(result).toContain('privacy');
  });

  it('extracts items from "e.g." pattern', () => {
    const result = parseSubItemsFromDescription(
      'Knowledge of data privacy principles and regulations (e.g. GDPR, APP)'
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it('extracts items from bracket patterns', () => {
    const result = parseSubItemsFromDescription(
      'Investigate common applications of key ML algorithms (data analysis, forecasting, image recognition)'
    );
    expect(result).toContain('data analysis');
    expect(result).toContain('forecasting');
    expect(result).toContain('image recognition');
  });

  it('returns empty array for descriptions without sub-items', () => {
    const result = parseSubItemsFromDescription(
      'Analyse the impact of AI on modern society'
    );
    expect(result).toEqual([]);
  });

  it('returns empty for empty/null input', () => {
    expect(parseSubItemsFromDescription('')).toEqual([]);
  });

  it('handles complex descriptions with multiple keyword patterns', () => {
    const result = parseSubItemsFromDescription(
      'Design, develop and apply ML regression models including linear, polynomial and logistic regression'
    );
    expect(result).toContain('linear');
    expect(result).toContain('polynomial');
    expect(result).toContain('logistic regression');
  });

  it('handles descriptions with "including" followed by colons', () => {
    const result = parseSubItemsFromDescription(
      'explore social and ethical issues including: privacy, consent, bias'
    );
    expect(result).toContain('privacy');
    expect(result).toContain('consent');
    expect(result).toContain('bias');
  });

  it('extracts items from parenthesised "including" lists', () => {
    const result = parseSubItemsFromDescription(
      'Select and use a range of representations to organise data and information (including graphs, keys, models, diagrams, tables and spreadsheets)'
    );
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result).toContain('graphs');
    expect(result).toContain('models');
    expect(result).toContain('spreadsheets');
  });

  it('extracts focus areas from real NESA dot points', () => {
    const result = parseSubItemsFromDescription(
      'Design, develop and implement code using defensive data input handling practices, including input validation, sanitisation and error handling'
    );
    expect(result).toContain('input validation');
    expect(result).toContain('sanitisation');
    expect(result).toContain('error handling');
  });

  it('handles dot points with both "including" and bracket patterns', () => {
    const result = parseSubItemsFromDescription(
      'Explore by implementation how patterns in human behaviour influence ML and AI software development including psychological responses, acute stress response, cultural protocols and belief systems'
    );
    expect(result).toContain('psychological responses');
    expect(result).toContain('acute stress response');
    expect(result).toContain('cultural protocols');
    expect(result).toContain('belief systems');
  });
});
