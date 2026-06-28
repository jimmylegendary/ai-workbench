/** Workspace settings (routes-and-screens.md / prototype-briefs/05-settings.md). STUB. */
export default function SettingsPage() {
  const sections = [
    { name: "Engine", note: "engine base URL · default backend · test connection" },
    { name: "Defaults", note: "representation · IR fill level · data boundary" },
    { name: "Appearance", note: "theme (light/dark/system) · density · accent" },
    { name: "Account & data", note: "Supabase project · metadata-only boundary note" },
  ];
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Setting</h1>
      <div className="mt-4 max-w-2xl space-y-2">
        {sections.map((s) => (
          <section
            key={s.name}
            className="rounded-[var(--radius-md)] border border-border bg-surface p-3"
          >
            <div className="text-sm font-medium">{s.name}</div>
            <div className="mt-1 font-readout text-xs text-text-muted">{s.note}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
