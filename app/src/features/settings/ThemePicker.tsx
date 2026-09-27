import { MATCH_PHONE_THEMES } from '../../design-system/themes/themeEngine';
import { themeIds, themeRegistry, useTheme } from '../../design-system/themes';

const phoneDark = themeRegistry[MATCH_PHONE_THEMES.dark].tokens;
const phoneLight = themeRegistry[MATCH_PHONE_THEMES.light].tokens;

/**
 * Settings "Appearance" card: "Match my phone" first, then every registered theme, each a radio with a swatch of its
 * background and main colour. Radios follow the saved choice, so "Match my phone" stays checked whichever theme it shows.
 */
export function ThemePicker() {
  const { preference, setPreference } = useTheme();
  return <section className="kairos-settings-card" aria-labelledby="kairos-settings-appearance">
    <div>
      <h2 id="kairos-settings-appearance">Appearance</h2>
      <p>Changes colours only. Your journal and settings stay the same.</p>
    </div>
    <fieldset className="kairos-theme-picker" aria-describedby="kairos-theme-picker-phone">
      <legend>Theme</legend>
      <label className="kairos-theme-picker__option">
        <input type="radio" name="kairos-theme" value="system" checked={preference === 'system'} onChange={() => setPreference('system')} />
        <span
          className="kairos-theme-picker__swatch"
          aria-hidden="true"
          style={{
            background: `linear-gradient(90deg, ${phoneDark['--kairos-background-base']} 50%, ${phoneLight['--kairos-background-base']} 50%)`,
            borderColor: phoneLight['--kairos-border-default'],
          }}
        />
        <span>Match my phone</span>
      </label>
      {themeIds.map(id => themeRegistry[id]).map(theme => <label key={theme.id} className="kairos-theme-picker__option">
        <input type="radio" name="kairos-theme" value={theme.id} checked={preference === theme.id} onChange={() => setPreference(theme.id)} />
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
    <p id="kairos-theme-picker-phone">Match my phone uses Kairos Depth when your phone is dark and Paper when it is light.</p>
  </section>;
}
