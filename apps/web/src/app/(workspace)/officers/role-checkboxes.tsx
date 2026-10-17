export type RoleOption = { value: string; label: string; hint: string };

export function RoleCheckboxes({ roles, selected = [], idPrefix }: { roles: RoleOption[]; selected?: readonly string[]; idPrefix: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Roles</legend>
      {roles.map((r) => (
        <label key={r.value} htmlFor={`${idPrefix}-${r.value}`} className="flex items-start gap-2 text-sm">
          <input
            id={`${idPrefix}-${r.value}`}
            type="checkbox"
            name="roles"
            value={r.value}
            defaultChecked={selected.includes(r.value)}
            className="accent-accent mt-0.5 size-4 shrink-0"
          />
          <span>
            {r.label}
            {r.hint && <span className="text-muted block text-xs">{r.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
