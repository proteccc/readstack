import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const kindle = await db.deliveryDestination.findFirst({
    where: { userId: user.id, kind: "kindle" },
  });

  return (
    <div style={{ paddingTop: 16 }}>
      <SettingsClient
        userEmail={user.email}
        kindleEmail={kindle?.email ?? ""}
      />
    </div>
  );
}
