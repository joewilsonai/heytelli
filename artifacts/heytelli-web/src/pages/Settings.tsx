import { FormEvent, useState } from "react";
import { LogOut, Save } from "lucide-react";
import { PageHeader } from "@/components/State";
import { useSession } from "@/lib/session-context";

export default function Settings() {
  const { session, apiBaseUrl, setApiBaseUrl, signOut } = useSession();
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
