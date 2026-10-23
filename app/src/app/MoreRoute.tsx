import { Link } from 'react-router';
import { moreNavigation } from './navigation';
import { PageHeader } from '../design-system/primitives';

export function MoreRoute() {
  return (
    <section className="kairos-route" aria-labelledby="kairos-route-more">
      <PageHeader title="More" titleId="kairos-route-more" intro="Open the parts of Kairos that are used less often." />
      <nav className="kairos-more-links" aria-label="More destinations">
        {moreNavigation.map((item) => (
          <Link key={item.to} className="kairos-more-links__item" to={item.to}>
            <span>{item.label}</span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
