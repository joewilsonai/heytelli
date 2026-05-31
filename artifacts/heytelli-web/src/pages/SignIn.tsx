import { FormEvent, useState } from "react";
import { useLoginBetaUser } from "@workspace/api-client-react";
import { LockKeyhole, Sparkles } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { ErrorBanner } from "@/components/State";

export default function SignIn() {
  const { apiBaseUrl, setApiBaseUrl, signIn } = useSession();
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [apiBaseDraft, setApiBaseDraft] = useState(apiBaseUrl ?? "");
  const login = useLoginBetaUser({
    mutation: {
      onSuccess(session) {
        signIn(session);
      },
    },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setApiBaseUrl(apiBaseDraft);
    login.mutate({
      data: {
        email,
        inviteCode,
        displayName: displayName.trim() || undefined,
      },
    });
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <span>HeyTelli</span>
        </div>
        <h1>Sign in</h1>
        <form className="form-stack" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Invite code</span>
            <input
              autoComplete="one-time-code"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Name</span>
            <input
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            <span>API base</span>
            <input
              inputMode="url"
              placeholder="Same origin"
              value={apiBaseDraft}
              onChange={(event) => setApiBaseDraft(event.target.value)}
            />
          </label>
          {login.error && (
            <ErrorBanner
              message={login.error instanceof Error ? login.error.message : "Sign-in failed"}
            />
          )}
          <button className="button primary" type="submit" disabled={login.isPending}>
            <LockKeyhole size={18} aria-hidden="true" />
            {login.isPending ? "Signing in" : "Continue"}
          </button>
        </form>
      </section>
      <section className="auth-preview" aria-label="HeyTelli preview">
        <div className="preview-phone">
          <div className="preview-photo" />
          <div className="preview-lines">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-row safety" />
          <div className="preview-row clarity" />
          <div className="preview-row pace" />
        </div>
      </section>
    </main>
  );
}
