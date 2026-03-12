import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardClient } from "./DashboardClient";

const pendingJobs = [
  {
    title: "One-shot URL send",
    detail: "Input form posts a job, worker resolves article URL, runs conversion pipeline, then delivers to Kindle.",
  },
  {
    title: "Auth-aware execution",
    detail: "Jobs should always run in a user context so recipient addresses and history are scoped correctly.",
  },
  {
    title: "Async status updates",
    detail: "This page should become the primary control surface for queued, running, and failed article sends.",
  },
];

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="shell">
      <section className="hero">
        <div className="stack">
          <span className="eyebrow">Dashboard MVP</span>
          <h1>Paste URL. Create job. Track send.</h1>
          <p>
            This page is the minimal non-CLI user flow: accept a source URL,
            create a background job, and expose its status without exposing
            implementation details like Calibre or SMTP setup.
          </p>
        </div>
      </section>

      <section className="panel-grid">
        <section className="panel">
          <div className="stack">
            <span className="eyebrow">Test 1 · Job creation</span>
            <h2>URL → queued job</h2>
            <p>
              This pill tests whether an authenticated user can submit an
              article URL and get a queued job row in Postgres.
            </p>

            <div className="field-list">
              <div className="field">
                <strong>Input</strong>
                <span className="muted">
                  A valid `http://` or `https://` article URL pasted into the
                  form below.
                </span>
              </div>
              <div className="field">
                <strong>Output</strong>
                <span className="muted">
                  A `Job` record in the database with status `queued`, tied to
                  your user id.
                </span>
              </div>
              <div className="field">
                <strong>Success state</strong>
                <span className="muted">
                  Inline success message: &quot;Job created. This page will
                  later show real-time status.&quot;
                </span>
              </div>
              <div className="field">
                <strong>Failure states</strong>
                <span className="muted">
                  Clear inline error if you are signed out, the URL is missing
                  or malformed, or the API fails to create the job.
                </span>
              </div>
            </div>

            <DashboardClient />
          </div>
        </section>

        <section className="panel">
          <div className="stack">
            <h2>Execution notes</h2>
            <div className="job-list">
              {pendingJobs.map((job) => (
                <div className="job" key={job.title}>
                  <strong>{job.title}</strong>
                  <span className="muted">{job.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}


