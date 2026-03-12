import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function HistoryPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const jobs = await db.job.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="shell">
      <section className="hero">
        <div className="stack">
          <span className="eyebrow">History</span>
          <h1>Recent sends</h1>
          <p>
            Every article you submit creates a job here. Once the worker is
            running, status will update as jobs move through the pipeline.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="stack">
          {jobs.length === 0 ? (
            <p className="muted">
              No jobs yet. Submit an article URL from the dashboard to get
              started.
            </p>
          ) : (
            <div className="job-list">
              {jobs.map((job) => (
                <div className="job" key={job.id}>
                  <strong>{job.status}</strong>
                  <span className="muted">
                    <code>{job.sourceUrl}</code>
                  </span>
                  {job.failureReason && (
                    <span className="muted" style={{ color: "red" }}>
                      {job.failureReason}
                    </span>
                  )}
                  <span className="muted" style={{ fontSize: "0.85em" }}>
                    {new Date(job.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}


