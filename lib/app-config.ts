export const appArchitecture = [
  {
    label: "Frontend",
    value: "Next.js app router with a minimal dashboard, settings page, and history surface.",
  },
  {
    label: "Persistence",
    value: "Postgres-backed users, delivery destinations, and jobs.",
  },
  {
    label: "Execution model",
    value: "Web app creates jobs, worker runs the existing Java pipeline, and status flows back into the UI.",
  },
];

export const appRoadmap = [
  "Add auth and session-aware routing.",
  "Stand up Postgres and Prisma migrations.",
  "Persist Kindle recipient addresses per user.",
  "Create URL submission API and job records.",
  "Move pipeline execution behind a worker boundary.",
];

export const defaultSettingsFields = [
  {
    label: "Primary Kindle email",
    description: "Main delivery destination for article sends.",
  },
  {
    label: "Secondary inbox",
    description: "Optional copy of each send for debugging and user confidence.",
  },
  {
    label: "Preferred output format",
    description: "Keep as EPUB for now, but store it as a user-level setting once multiple outputs exist.",
  },
];
