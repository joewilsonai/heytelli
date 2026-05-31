import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="kicker">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state-block" role="status">
      <Loader2 className="spin" size={22} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
