import { themeIds, themeRegistry, useTheme } from '../../design-system/themes';

/** Settings "Appearance" card: every registered theme as a radio with a swatch of its background and main colour. */
export function ThemePicker() {
  const { themeId, setPreference } = useTheme();
  return <section className="kairos-settings-card" aria-labelledby="kairos-settings-appearance">
    <div>
      <h2 id="kairos-settings-appearance">Appearance</h2>
      <p>Changes colours only. Your journal and settings stay the same.</p>
    </div>
    <fieldset className="kairos-theme-picker">
      <legend>Theme</legend>
      {themeIds.map(id => themeRegistry[id]).map(theme => <label key={theme.id} className="kairos-theme-picker__option">
        <input type="radio" name="kairos-theme" value={theme.id} checked={themeId === theme.id} onChange={() => setPreference(theme.id)} />
        <span
          className="kairos-theme-picker__swatch"
          aria-hidden="true"
          style={{ background: theme.tokens['--kairos-background-base'], borderColor: theme.tokens['--kairos-border-default'] }}
        >
          <span style={{ background: theme.tokens['--kairos-accent-primary'] }} />
        </span>
        <span>{theme.label}</span>
      </label>)}
    </fieldset>
  </section>;
}
