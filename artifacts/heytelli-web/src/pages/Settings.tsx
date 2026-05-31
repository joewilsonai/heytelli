import { FormEvent, useState } from "react";
import { LogOut, Palette, Save } from "lucide-react";
import { PageHeader } from "@/components/State";
import { WEB_COLOR_THEME_OPTIONS } from "@/lib/color-theme";
import { useSession } from "@/lib/session-context";

export default function Settings() {
  const {
    session,
    apiBaseUrl,
    colorTheme,
    setApiBaseUrl,
    setColorTheme,
    signOut,
  } = useSession();
  const [apiBaseDraft, setApiBaseDraft] = useState(apiBaseUrl ?? "");
  const [saved, setSaved] = useState(false);

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setApiBaseUrl(apiBaseDraft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <section className="page narrow">
      <PageHeader eyebrow="Account" title="Settings" />
      <div className="panel">
        <h2>{session?.user.displayName || session?.user.email}</h2>
        <p className="muted">{session?.user.email}</p>
      </div>
      <div className="panel">
        <div className="panel-title">
          <Palette size={18} aria-hidden="true" />
          <h2>Color theme</h2>
        </div>
        <div className="theme-choice-grid" role="radiogroup" aria-label="Color theme">
          {WEB_COLOR_THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`theme-choice ${colorTheme === option.value ? "is-active" : ""}`}
              type="button"
              role="radio"
              aria-checked={colorTheme === option.value}
              onClick={() => setColorTheme(option.value)}
            >
              <span className="theme-swatches" aria-hidden="true">
                {option.swatches.map((swatch) => (
                  <span key={swatch} style={{ background: swatch }} />
                ))}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
      <form className="panel form-stack" onSubmit={save}>
        <label>
          <span>API base</span>
          <input
            inputMode="url"
            placeholder="Same origin"
            value={apiBaseDraft}
            onChange={(event) => setApiBaseDraft(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="button primary" type="submit">
            <Save size={18} aria-hidden="true" />
            {saved ? "Saved" : "Save"}
          </button>
          <button className="button danger" type="button" onClick={signOut}>
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </form>
    </section>
  );
}
