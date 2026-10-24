export function PlaceholderRoute({ title }: { title: string }) {
  const headingId = `kairos-route-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section className="kairos-route" aria-labelledby={headingId}>
      <h1 id={headingId}>{title}</h1>
      <p>This area is ready for a future Kairos patch.</p>
    </section>
  );
}
