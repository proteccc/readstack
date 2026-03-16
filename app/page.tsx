import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SendForm } from "./SendForm";
import { GuestMigration } from "./GuestMigration";

export default async function HomePage() {
  const user = await getCurrentUser();

  let kindleEmail: string | null = null;
  let recentJobs: Array<{
    id: string;
    title: string | null;
    sourceUrl: string;
    status: string;
    createdAt: string;
  }> = [];

  if (user) {
    const kindle = await db.deliveryDestination.findFirst({
      where: { userId: user.id, kind: "kindle" },
    });
    kindleEmail = kindle?.email ?? null;

    const jobs = await db.job.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { id: true, title: true, sourceUrl: true, status: true, createdAt: true },
    });
    recentJobs = jobs.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
    }));
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <GuestMigration isSignedIn={!!user} />
      <SendForm
        serverKindleEmail={kindleEmail}
        recentJobs={recentJobs}
        isSignedIn={!!user}
      />
    </div>
  );
}
