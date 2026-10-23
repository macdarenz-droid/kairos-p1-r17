import { useId } from 'react';
import { Link } from 'react-router';
import { moreNavigationGroups, type KairosMoreItem } from './navigation';
import { Icon } from '../design-system/icons/Icon';
import { PageHeader } from '../design-system/primitives';

/** One More row: its icon, its name (the link's name) and its line (the link's description). */
function MoreLink({ item }: { readonly item: KairosMoreItem }) {
  const id = useId();
  return <li>
    <Link className="kairos-more-links__item" to={item.to} aria-labelledby={`${id}-label`} aria-describedby={`${id}-line`}>
      <Icon name={item.icon} size={24} className="kairos-more-links__icon" />
      <span className="kairos-more-links__text">
        <span id={`${id}-label`} className="kairos-more-links__label">{item.label}</span>
        <span id={`${id}-line`} className="kairos-more-links__line">{item.line}</span>
      </span>
      <Icon name="chevron-down" size={16} className="kairos-more-links__chevron" />
    </Link>
  </li>;
}

export function MoreRoute() {
  return (
    <section className="kairos-route" aria-labelledby="kairos-route-more">
      <PageHeader title="More" titleId="kairos-route-more" intro="Your plan, practice, money and the app's own settings." />
      <nav className="kairos-more-links" aria-label="More destinations">
        {moreNavigationGroups.map((group) => {
          const titleId = `kairos-more-${group.title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
          return <section key={group.title} className="kairos-more-links__group" aria-labelledby={titleId}>
            <h2 id={titleId} className="kairos-more-links__title">{group.title}</h2>
            <ul className="kairos-more-links__list">{group.items.map((item) => <MoreLink key={item.to} item={item} />)}</ul>
          </section>;
        })}
      </nav>
    </section>
  );
}
