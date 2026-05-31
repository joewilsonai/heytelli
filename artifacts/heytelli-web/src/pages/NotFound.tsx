import { Link } from "wouter";

export default function NotFound() {
  return (
    <section className="page narrow">
      <div className="empty-state">
        <h1>Page not found</h1>
        <p>This HeyTelli screen is not available.</p>
        <Link href="/" className="button primary">
          Go home
        </Link>
      </div>
    </section>
  );
}
