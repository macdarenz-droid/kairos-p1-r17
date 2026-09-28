import { Link } from 'react-router';

export function NotFoundRoute() {
  return (
    <section className="kairos-route" aria-labelledby="kairos-route-not-found">
      <h1 id="kairos-route-not-found">Page not found</h1>
      <p>This page doesn't exist.</p>
      <Link to="/">Go to Home</Link>
    </section>
  );
}
