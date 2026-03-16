import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusLabel(status: string) {
  if (status === "completed") return { text: "Sent", cls: "sent" };
  if (status === "failed") return { text: "Failed", cls: "failed" };
  return { text: "Sending…", cls: "sending" };
}

function shortHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function HistoryPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const jobs = await db.job.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      status: true,
      createdAt: true,
      failureReason: true,
    },
  });

  return (
    <div style={{ paddingTop: 16 }}>
      <div className="send-card" style={{ maxWidth: 760 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Recent sends
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            {jobs.length} article{jobs.length !== 1 ? "s" : ""} sent
          </p>
        </div>

        {jobs.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            No sends yet — paste a URL on the home page to get started.
          </p>
        ) : (
          <div className="history-grid">
            {jobs.map((job) => {
              const badge = statusLabel(job.status);
              return (
                <div className="history-item" key={job.id}>
                  <div className="history-row1">
                    <span className="history-title">
                      {job.title ?? shortHost(job.sourceUrl)}
                    </span>
                    <span className={`history-badge ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                  <div className="history-row2">
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="history-url"
                    >
                      URL ↗
                    </a>
                    <span className="history-dot">·</span>
                    <span className="history-date">
                      {formatDate(job.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
