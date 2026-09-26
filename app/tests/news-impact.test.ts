import { describe, expect, it } from 'vitest';
import { rateOfficialRelease } from '../src/domain/economic-calendar/newsImpact';

describe("Kairos's size list: the Fed Chair rule", () => {
  it('rates the Chair with the Fed\'s own " -- " separator as well as " - "', () => {
    const chair = { size: 'medium', plainName: 'US Fed Chair speaks' };
    for (const title of ['Speech -- Chair Jerome H. Powell', 'Speech - Chair Jerome H. Powell', 'Testimony -- Chair Jerome H. Powell', 'Discussion -- Chairman Kevin Warsh']) {
      expect(rateOfficialRelease('fed', title), title).toEqual(chair);
    }
  });

  it('does not rate a title that only mentions a Chair elsewhere', () => {
    for (const title of ['Speech -- Vice Chair Philip N. Jefferson', 'Speech --- Chair Jerome H. Powell']) {
      expect(rateOfficialRelease('fed', title), title).toBeNull();
    }
  });

  it("rates the Chair's panels, roundtables and conversations, and \"--\" with or without spaces; never a Vice Chair or a governor", () => {
    const chair = { size: 'medium', plainName: 'US Fed Chair speaks' };
    for (const title of [
      'Panel Discussion -- Chairman Jerome H. Powell',
      'Roundtable Discussion: Chair Jerome H. Powell and Governor Michelle W. Bowman',
      'Conversation with the Chair: A Teacher Town Hall Meeting',
      'Speech--Chair Jerome H. Powell',
    ]) {
      expect(rateOfficialRelease('fed', title), title).toEqual(chair);
    }
    for (const title of ['Speech -- Vice Chair Philip N. Jefferson', 'Speech--Vice Chairman Philip N. Jefferson', 'Panel Discussion -- Vice Chair Philip N. Jefferson', 'Speech -- Governor Christopher J. Waller', 'Conversation with the Vice Chair: Jobs']) {
      expect(rateOfficialRelease('fed', title), title).toBeNull();
    }
  });
});
