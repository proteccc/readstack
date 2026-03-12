import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const destinations = await db.deliveryDestination.findMany({
    where: { userId: user.id },
  });

  const kindleDestination = destinations.find((d) => d.kind === "kindle");
  const emailDestination = destinations.find((d) => d.kind === "email");

  return (
    <div className="shell">
      <section className="hero">
        <div className="stack">
          <span className="eyebrow">Settings</span>
          <h1>Delivery destinations</h1>
          <p>
            Configure where your articles are sent. Your Kindle email is
            required; the secondary inbox is optional and useful for keeping a
            copy for yourself.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="stack">
          <SettingsClient
            kindleEmail={kindleDestination?.email ?? ""}
            secondaryEmail={emailDestination?.email ?? ""}
          />
        </div>
      </section>
    </div>
  );
}

