import Link from "next/link";
import { appArchitecture, appRoadmap } from "@/lib/app-config";

export default function HomePage() {
  return (
    <div className="shell">
      <section className="hero">
        <div className="hero-grid">
          <div className="stack">
            <span className="eyebrow">Protected Baseline Preserved</span>
            <h1>Readstack is ready to move from CLI proof to web product.</h1>
            <p>
              The Java EPUB pipeline remains the source of truth. This new app shell
              is the thin product layer that will handle auth, recipient settings,
              job creation, and delivery history.
            </p>
            <div className="cta-row">
              <Link className="button" href="/dashboard">
                Open MVP Dashboard
              </Link>
              <Link className="button-secondary" href="/settings">
                Review User Settings
              </Link>
            </div>
          </div>
          <div className="metric">
            <strong>Current thesis</strong>
            <p className="muted">
              Keep the conversion pipeline stable. Wrap it with the smallest possible
              hosted workflow for non-technical users.
            </p>
          </div>
        </div>
      </section>

      <section className="metrics">
        {appArchitecture.map((item) => (
          <article className="metric" key={item.label}>
            <strong>{item.label}</strong>
            <p className="muted">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="stack">
          <h2>Immediate build path</h2>
          <div className="job-list">
            {appRoadmap.map((step, index) => (
              <div className="job" key={step}>
                <strong>
                  {index + 1}. {step}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
