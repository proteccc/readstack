import { redirect } from "next/navigation";
import { defaultSettingsFields } from "@/lib/app-config";
import { getCurrentUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="shell">
      <section className="hero">
        <div className="stack">
          <span className="eyebrow">User Settings</span>
          <h1>Recipient storage belongs in the product now.</h1>
          <p>
            The web app needs persisted delivery destinations so users do not
            need to repeat Kindle setup or touch local config. This page is the
            natural home for that state.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="stack">
          <span className="eyebrow">Test 2 · Destination model</span>
          <h2>Persisted Kindle addresses (design stub)</h2>
          <p>
            This pill describes the shape of the delivery-destination model we
            will wire next, and gives you a checklist for what to verify once
            the form is live.
          </p>

          <div className="field-list">
            <div className="field">
              <strong>Input</strong>
              <span className="muted">
                Primary Kindle email (required) and optional secondary inbox,
                captured from a future settings form.
              </span>
            </div>
            <div className="field">
              <strong>Output</strong>
              <span className="muted">
                `DeliveryDestination` rows in Postgres scoped to your `User.id`,
                with one primary Kindle address.
              </span>
            </div>
            <div className="field">
              <strong>Success state</strong>
              <span className="muted">
                Settings form loads with your saved addresses pre-filled and
                updates them without errors.
              </span>
            </div>
            <div className="field">
              <strong>Failure states</strong>
              <span className="muted">
                Validation errors for invalid emails, and clear messaging if the
                backend fails to save changes.
              </span>
            </div>
          </div>

          <div className="field-list">
            {defaultSettingsFields.map((field) => (
              <div className="field" key={field.label}>
                <strong>{field.label}</strong>
                <span className="muted">{field.description}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

