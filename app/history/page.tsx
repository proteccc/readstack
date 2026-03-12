import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

const exampleJobs = [
  {
    status: "Succeeded",
    url: "https://open.substack.com/...",
    detail: "EPUB generated and delivered to Kindle + test inbox.",
  },
  {
    status: "Failed",
    url: "https://substack.com/app-link/...",
    detail: "Conversion completed, delivery failed. Store provider response for debugging.",
  },
  {
    status: "Running",
    url: "https://example.com/article",
    detail: "Worker has normalized the URL and is generating local assets.",
  },
];

export default async function HistoryPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="shell">
      <section className="hero">
        <div className="stack">
          <span className="eyebrow">Jobs + Observability</span>
          <h1>Delivery history should become the product&apos;s debugging surface.</h1>
          <p>
            A simple history page reduces support overhead, gives users
            confidence that sends are actually happening, and makes it easier to
            isolate source extraction failures from Kindle delivery failures.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="stack">
          <span className="eyebrow">Test 3 · History surface</span>
          <h2>Jobs list as debugging pill</h2>
          <p>
            This pill will evolve into a live view of your recent jobs, letting
            you confirm whether a URL made it through the pipeline and where it
            failed if not.
          </p>

          <div className="field-list">
            <div className="field">
              <strong>Input</strong>
              <span className="muted">
                Your authenticated user context; no manual input beyond browsing
                this page.
              </span>
            </div>
            <div className="field">
              <strong>Output</strong>
              <span className="muted">
                A list of `Job` records for your user, including status, URL,
                and any failure reason.
              </span>
            </div>
            <div className="field">
              <strong>Success state</strong>
              <span className="muted">
                Recent sends appear here with accurate statuses that match what
                the worker did.
              </span>
            </div>
            <div className="field">
              <strong>Failure states</strong>
              <span className="muted">
                Clear messaging if history cannot load, plus per-job failure
                reasons once the worker is wired.
              </span>
            </div>
          </div>

          <h2>Example job records</h2>
          <div className="job-list">
            {exampleJobs.map((job) => (
              <div className="job" key={`${job.status}-${job.url}`}>
                <strong>{job.status}</strong>
                <span className="muted">
                  <code>{job.url}</code>
                </span>
                <span className="muted">{job.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}


