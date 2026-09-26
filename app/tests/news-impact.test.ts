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
    for (const title of ['Speech -- Vice Chair Philip N. Jefferson', 'Conversation with the Chair: A Teacher Town Hall Meeting', 'Speech --- Chair Jerome H. Powell']) {
      expect(rateOfficialRelease('fed', title), title).toBeNull();
    }
  });
});
