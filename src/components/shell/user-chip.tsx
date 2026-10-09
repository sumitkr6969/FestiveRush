const USER = { name: "Ananya Rao", role: "Regional Supply Manager", initials: "AR" } as const;

export function UserChip() {
  return (
    <div className="flex items-center gap-2.5" title={`${USER.name}, ${USER.role}`}>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
      >
        {USER.initials}
      </span>
      {/* Visually hidden on small screens but still read by screen readers. */}
      <span className="sr-only flex-col leading-tight md:not-sr-only md:flex">
        <span className="text-sm font-medium">{USER.name}</span>
        <span className="text-xs text-muted-foreground">{USER.role}</span>
      </span>
    </div>
  );
}
