import { Link } from 'react-router';
import { moreNavigation } from './navigation';

export function MoreRoute() {
  return (
    <section className="kairos-route" aria-labelledby="kairos-route-more">
      <h1 id="kairos-route-more">More</h1>
      <p>Open the parts of Kairos that are used less often.</p>
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
