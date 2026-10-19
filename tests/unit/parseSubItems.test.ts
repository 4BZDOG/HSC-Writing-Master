import { describe, it, expect } from 'vitest';
import {
  getDotPointLabel,
  parseSubItemsFromDescription,
  splitDotPointDescription,
} from '../../utils/dataManagerUtils';

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
    const result = parseSubItemsFromDescription('Analyse the impact of AI on modern society');
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

  // The shape NESA actually prints, and the shape the syllabus importer
  // produces. Read as one line the inline heuristics returned the whole block
  // as a single unusable focus area.
  describe('lists the author wrote as lines', () => {
    const BULLETED = [
      'Influences on the global economic activity',
      'Including:',
      '   * biophysical',
      '   * economic',
      '   * technological',
      '   * political/organisational',
    ].join('\n');

    it('takes one focus area per bullet', () => {
      expect(parseSubItemsFromDescription(BULLETED)).toEqual([
        'biophysical',
        'economic',
        'technological',
        'political/organisational',
      ]);
    });

    it('does not fold the whole list into one item', () => {
      const result = parseSubItemsFromDescription(BULLETED);
      expect(result.some((item) => item.includes('*'))).toBe(false);
      expect(result).not.toContain('biophysical economic technological political/organisational');
    });

    it('reads a bare "Including:" line with unbulleted items under it', () => {
      const result = parseSubItemsFromDescription(
        'Influences on the global economic activity\nIncluding:\nbiophysical\neconomic\ntechnological'
      );
      expect(result).toEqual(['biophysical', 'economic', 'technological']);
    });

    it('handles numbered and dashed markers too', () => {
      expect(parseSubItemsFromDescription('Factors\n- climate\n- soil\n- water')).toEqual([
        'climate',
        'soil',
        'water',
      ]);
      expect(parseSubItemsFromDescription('Factors\n1. climate\n2. soil')).toEqual([
        'climate',
        'soil',
      ]);
    });
  });
});

describe('splitDotPointDescription', () => {
  it('separates the statement from a bulleted "Including" list', () => {
    const { stem, items } = splitDotPointDescription(
      'Influences on the global economic activity\nIncluding:\n * biophysical\n * economic\n * technological'
    );
    expect(stem).toBe('Influences on the global economic activity');
    expect(items).toEqual(['biophysical', 'economic', 'technological']);
  });

  it('separates the statement from a trailing inline list', () => {
    const { stem, items } = splitDotPointDescription(
      'Use Punnett squares to solve inheritance problems, including codominance, incomplete dominance and multiple alleles'
    );
    expect(stem).toBe('Use Punnett squares to solve inheritance problems');
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('drops a trailing bracketed list without leaving the bracket behind', () => {
    const { stem } = splitDotPointDescription(
      'Select and use a range of representations to organise data and information (including graphs, keys, models, diagrams, tables and spreadsheets)'
    );
    expect(stem).toBe('Select and use a range of representations to organise data and information');
  });

  it('keeps the wording when the list has fewer than two items', () => {
    const description = 'Apply quantitative processes to data, including unit conversions';
    expect(splitDotPointDescription(description).stem).toBe(description);
  });

  it('keeps the wording when there is no list at all', () => {
    const description = 'Analyse the impact of AI on modern society';
    expect(splitDotPointDescription(description)).toEqual({ stem: description, items: [] });
  });

  it('keeps the wording when cutting the list would leave no statement', () => {
    const description = 'Including: alpha, beta, gamma';
    expect(splitDotPointDescription(description).stem).toBe(description);
  });

  it('is safe on empty input', () => {
    expect(splitDotPointDescription(undefined)).toEqual({ stem: '', items: [] });
  });
});

describe('getDotPointLabel', () => {
  it('labels a dot point by its statement alone', () => {
    expect(
      getDotPointLabel({
        description:
          'Influences on the global economic activity\nIncluding:\n * biophysical\n * economic',
      })
    ).toBe('Influences on the global economic activity');
  });

  it('never returns the focus areas the Active Focus menu already shows', () => {
    const label = getDotPointLabel({
      description:
        'Influences on the global economic activity\nIncluding:\n * biophysical\n * economic',
    });
    expect(label).not.toMatch(/biophysical|economic activity\n/);
  });
});

describe('focus areas from the shapes NESA writes (October 2026 review)', () => {
  it('keeps "Aboriginal and Torres Strait Islander Peoples" as one item', () => {
    expect(
      parseSubItemsFromDescription(
        'Investigate the role of communities, including Aboriginal and Torres Strait Islander Peoples, families and schools'
      )
    ).toEqual(['Aboriginal and Torres Strait Islander Peoples', 'families', 'schools']);
  });

  it('splits a series with no "including" into one focus area each, and shortens the label', () => {
    const d =
      'Select qualitative and quantitative information from texts, diagrams, flow charts, tables, databases, graphs and multimedia resources';
    expect(parseSubItemsFromDescription(d)).toEqual([
      'texts',
      'diagrams',
      'flow charts',
      'tables',
      'databases',
      'graphs',
      'multimedia resources',
    ]);
    expect(splitDotPointDescription(d).stem).toBe(
      'Select qualitative and quantitative information from …'
    );
  });

  it('takes bracketed sub-points whole, split on semicolons only, and labels the statement', () => {
    const d =
      'Analyse the current health status of Australians from Australia’s Health and other health reports, tables and graphs (what does the data tell us?; what are the major causes of morbidity and mortality, and the life expectancy for males, females and the general population?; where do inequities exist and what can we do about them?)';
    expect(parseSubItemsFromDescription(d)).toEqual([
      'what does the data tell us?',
      'what are the major causes of morbidity and mortality, and the life expectancy for males, females and the general population?',
      'where do inequities exist and what can we do about them?',
    ]);
    expect(splitDotPointDescription(d).stem).toBe(
      'Analyse the current health status of Australians from Australia’s Health and other health reports, tables and graphs'
    );
  });

  it('reads a series mid-sentence without shortening the label', () => {
    const d =
      'Relate the movement of glucose, oxygen, carbon dioxide, salts and wastes across membranes to concentration gradients';
    expect(parseSubItemsFromDescription(d)).toEqual([
      'glucose',
      'oxygen',
      'carbon dioxide',
      'salts',
      'wastes',
    ]);
    expect(splitDotPointDescription(d).stem).toBe(d);
  });

  it('gives adjectives in a series the noun they share', () => {
    expect(
      parseSubItemsFromDescription(
        'Predict the effects of hypertonic, hypotonic and isotonic solutions on animal and plant cells'
      )
    ).toEqual(['hypertonic solutions', 'hypotonic solutions', 'isotonic solutions']);
  });

  it('reads a semicolon list after a colon', () => {
    const d =
      'Evaluate the effectiveness of the law using criteria. These include: accessibility of the law; achievement of justice; application of the rule of law';
    expect(parseSubItemsFromDescription(d)).toEqual([
      'accessibility of the law',
      'achievement of justice',
      'application of the rule of law',
    ]);
    expect(splitDotPointDescription(d).stem).toBe(
      'Evaluate the effectiveness of the law using criteria'
    );
  });

  it('keeps a nested bracket whole', () => {
    expect(
      parseSubItemsFromDescription(
        'Explore cloud computing services (Infrastructure as a Service (IaaS); Software as a Service (SaaS))'
      )
    ).toEqual(['Infrastructure as a Service (IaaS)', 'Software as a Service (SaaS)']);
  });

  it('does not take an abbreviation or a plural in brackets as a focus area', () => {
    expect(
      parseSubItemsFromDescription(
        'Explain how the user interface (UI) impacts on the user experience (UX)'
      )
    ).toEqual([]);
    expect(parseSubItemsFromDescription('Propose the most appropriate option(s)')).toEqual([]);
  });

  it('leaves sentences and noun-phrase content alone', () => {
    expect(
      parseSubItemsFromDescription(
        'Analyse the extent of inequality in Australia, its causes and consequences'
      )
    ).toEqual([]);
    expect(
      parseSubItemsFromDescription(
        'The roles and images of the king, the concepts of Ma’at and Isfet, the roles of the official class and the roles of women'
      )
    ).toEqual([]);
  });
});
