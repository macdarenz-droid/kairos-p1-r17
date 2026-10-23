import { Link } from 'react-router';
import { PageHeader } from '../../design-system/primitives';

export function NotFoundRoute() {
  return (
    <section className="kairos-route" aria-labelledby="kairos-route-not-found">
      <PageHeader title="Page not found" titleId="kairos-route-not-found" intro="This page doesn't exist." />
      <Link to="/">Go to Home</Link>
    </section>
  );
}
