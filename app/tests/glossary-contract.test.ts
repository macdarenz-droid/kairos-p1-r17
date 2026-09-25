import { describe, expect, it } from 'vitest';
import { parseGlossary, searchGlossary, type GlossaryTerm } from '../src/domain/learn/glossary';
import { parseLearnPictureSpec } from '../src/domain/learn/learnPicture';

const term = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, plainWords: `Words ${id}`, tradingTerm: `Term ${id}`, alsoCalled: [], explanation: `Plain sentence about ${id}.`, picture: null, related: [], ...overrides,
});
const glossary = (...terms: unknown[]) => ({ version: 1, terms });

describe('P24.1 parseLearnPictureSpec', () => {
  it('returns a frozen copy of each valid kind', () => {
    const shapes = [
      { kind: 'risk-box', side: 'long', target: true, highlight: 'reward' },
      { kind: 'risk-box', side: 'short', target: false, highlight: null },
      { kind: 'candle', direction: 'down' },
      { kind: 'result-bars', highlight: 'fees' },
      { kind: 'leverage', accountSteps: 20, tradeSteps: 0 },
      { kind: 'leverage', accountSteps: 4, tradeSteps: 20 },
    ];
    for (const shape of shapes) {
      const parsed = parseLearnPictureSpec(shape);
      expect(parsed).toEqual(shape);
      expect(parsed).not.toBe(shape);
      expect(Object.isFrozen(parsed)).toBe(true);
    }
  });

  it('refuses anything that is not exactly one of the shapes', () => {
    const refused: unknown[] = [
      { kind: 'svg' },
      { kind: 'risk-box', side: 'long', target: true, highlight: null, path: 'M0 0' },
      { kind: 'risk-box', side: 'long', highlight: null },
      { kind: 'risk-box', side: 'long', target: false, highlight: 'target' },
      { kind: 'candle', direction: 'sideways' },
      { kind: 'leverage', accountSteps: 21, tradeSteps: 20 },
      { kind: 'leverage', accountSteps: 1.5, tradeSteps: 20 },
      { kind: 'leverage', accountSteps: 3, tradeSteps: 10 },
      null,
      [],
    ];
    for (const value of refused) expect(parseLearnPictureSpec(value)).toBeNull();
  });
});

describe('P24.1 parseGlossary', () => {
  it('reads a valid glossary, trims text and freezes everything', () => {
    const picture = { kind: 'risk-box', side: 'long', target: true, highlight: 'stop' };
    const result = parseGlossary(glossary(
      term('stop', { plainWords: '  Stop  ', tradingTerm: ' Stop loss ', alsoCalled: [' SL '], explanation: ' Where you get out. ', picture, related: ['fees'] }),
      term('fees', { plainWords: 'Fees' }),
    ));
    expect(result.problems).toEqual([]);
    expect(result.terms).toEqual([
      { id: 'stop', plainWords: 'Stop', tradingTerm: 'Stop loss', alsoCalled: ['SL'], explanation: 'Where you get out.', picture, related: ['fees'] },
      { id: 'fees', plainWords: 'Fees', tradingTerm: 'Term fees', alsoCalled: [], explanation: 'Plain sentence about fees.', picture: null, related: [] },
    ]);
    const [stop, fees] = result.terms;
    for (const frozen of [result, result.terms, result.problems, stop, stop.alsoCalled, stop.related, stop.picture, fees]) expect(Object.isFrozen(frozen)).toBe(true);
    expect(fees.picture).toBeNull();
  });

  it('gives no words and one problem for a glossary-level fault', () => {
    const cases: [unknown, unknown][] = [
      [null, { index: null, id: null, field: null, reason: 'glossary-missing' }],
      [[], { index: null, id: null, field: null, reason: 'glossary-missing' }],
      [{ version: 2, terms: [] }, { index: null, id: null, field: 'version', reason: 'unsupported-version' }],
      [{ version: 1 }, { index: null, id: null, field: 'terms', reason: 'glossary-missing' }],
      [{ version: 1, terms: [], extra: 1 }, { index: null, id: null, field: 'extra', reason: 'unknown-field' }],
    ];
    for (const [value, problem] of cases) expect(parseGlossary(value)).toEqual({ terms: [], problems: [problem] });
  });

  it('skips only the refused entry and names the exact problem', () => {
    const cases: [Record<string, unknown>, string | null, string, string][] = [
      [term('bad', { html: '<b>' }), 'bad', 'html', 'unknown-field'],
      [term('Bad Id'), 'Bad Id', 'id', 'invalid-field'],
      [term('bad', { plainWords: '   ' }), 'bad', 'plainWords', 'invalid-field'],
      [term('bad', { plainWords: 'x'.repeat(61) }), 'bad', 'plainWords', 'invalid-field'],
      [term('bad', { tradingTerm: 'Stop\nloss' }), 'bad', 'tradingTerm', 'invalid-field'],
      [term('bad', { explanation: 'x'.repeat(281) }), 'bad', 'explanation', 'invalid-field'],
      [term('bad', { alsoCalled: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), 'bad', 'alsoCalled', 'invalid-field'],
      [term('bad', { alsoCalled: ['x'.repeat(41)] }), 'bad', 'alsoCalled', 'invalid-field'],
      [term('bad', { picture: { kind: 'svg' } }), 'bad', 'picture', 'invalid-field'],
      [term('bad', { related: ['Bad Id'] }), 'bad', 'related', 'invalid-field'],
      [term('bad', { related: ['bad'] }), 'bad', 'related', 'invalid-field'],
      [term('bad', { related: ['first', 'first'] }), 'bad', 'related', 'invalid-field'],
      [term('first', { plainWords: 'Another first' }), 'first', 'id', 'duplicate-id'],
      [term('bad', { plainWords: 'fees!' }), 'bad', 'plainWords', 'duplicate-plain-words'],
    ];
    for (const [entry, id, field, reason] of cases) {
      const result = parseGlossary(glossary(term('first', { plainWords: 'Fees' }), entry, term('last')));
      expect(result.problems).toEqual([{ index: 1, id, field, reason }]);
      expect(result.terms.map((kept) => kept.id)).toEqual(['first', 'last']);
    }
    const notObject = parseGlossary(glossary('text', term('last')));
    expect(notObject.problems).toEqual([{ index: 0, id: null, field: null, reason: 'invalid-field' }]);
    expect(notObject.terms.map((kept) => kept.id)).toEqual(['last']);
  });

  it('refuses holes in the lists like undefined, never skipping them', () => {
    const holeInTerms = parseGlossary({ version: 1, terms: [term('first'), , term('last')] });
    expect(holeInTerms.problems).toEqual([{ index: 1, id: null, field: null, reason: 'invalid-field' }]);
    expect(holeInTerms.terms.map((kept) => kept.id)).toEqual(['first', 'last']);
    const holeInAlsoCalled = parseGlossary(glossary(term('first'), term('bad', { alsoCalled: [, 'x'] })));
    expect(holeInAlsoCalled.problems).toEqual([{ index: 1, id: 'bad', field: 'alsoCalled', reason: 'invalid-field' }]);
    const holeInRelated = parseGlossary(glossary(term('first'), term('bad', { related: [, 'first'] })));
    expect(holeInRelated.problems).toEqual([{ index: 1, id: 'bad', field: 'related', reason: 'invalid-field' }]);
    expect(holeInRelated.terms.map((kept) => kept.id)).toEqual(['first']);
  });

  it('keeps a word that links to a missing word, without that link', () => {
    const result = parseGlossary(glossary(term('first'), term('second', { related: ['first', 'missing'] })));
    expect(result.terms.map((kept) => kept.id)).toEqual(['first', 'second']);
    expect(result.terms[1].related).toEqual(['first']);
    expect(Object.isFrozen(result.terms[1].related)).toBe(true);
    expect(result.problems).toEqual([{ index: 1, id: 'second', field: 'related', reason: 'unknown-related' }]);
  });
});

describe('P24.1 searchGlossary', () => {
  const { terms } = parseGlossary(glossary(
    term('result', { plainWords: 'Result after fees', tradingTerm: 'Net profit and loss', alsoCalled: ['net PnL'], explanation: 'What you made or lost once fees are paid.' }),
    term('fees', { plainWords: 'Fees', tradingTerm: 'Trading fees', alsoCalled: ['commission'], explanation: 'What the exchange charges you for each trade.' }),
    term('r-multiple', { plainWords: '× what you risked', tradingTerm: 'R multiple', alsoCalled: ['R'], explanation: 'Your result counted in units of the amount you risked.' }),
    term('stop', { plainWords: 'Stop', tradingTerm: 'Stop loss', alsoCalled: ['SL'], explanation: 'The price where you get out to keep a loss small.' }),
    term('entry', { plainWords: 'Entry', tradingTerm: 'Entry price', alsoCalled: [], explanation: 'The price where you get in.' }),
    term('wick', { plainWords: 'Wick', tradingTerm: 'Shadow', alsoCalled: [], explanation: 'The thin line of a candle showing how far price went.' }),
  ));
  const ids = (found: readonly GlossaryTerm[]) => found.map((item) => item.id);

  it('lists every word by its plain words for an empty query', () => {
    const all = ['entry', 'fees', 'result', 'stop', 'r-multiple', 'wick'];
    expect(ids(searchGlossary(terms, ''))).toEqual(all);
    expect(ids(searchGlossary(terms, '  '))).toEqual(all);
    expect(Object.isFrozen(searchGlossary(terms, ''))).toBe(true);
  });

  it('ranks exact names, then starts, then word starts, then the explanation', () => {
    expect(ids(searchGlossary(terms, 'r'))[0]).toBe('r-multiple');
    expect(ids(searchGlossary(terms, 'R'))).toEqual(['r-multiple', 'result']);
    expect(ids(searchGlossary(terms, 'fee'))).toEqual(['fees', 'result']);
    expect(ids(searchGlossary(terms, 'pnl'))).toEqual(['result']);
    expect(ids(searchGlossary(terms, 'price'))).toEqual(['entry', 'stop', 'wick']);
    expect(ids(searchGlossary(terms, 'LOSS'))).toEqual(['result', 'stop']);
  });

  it('matches only at the start of a word, and finds nothing for an unknown word', () => {
    expect(ids(searchGlossary(terms, 'ees'))).toEqual([]);
    expect(searchGlossary(terms, 'zebra')).toEqual([]);
  });
});
