import type { PermissionCode } from '@sirai/auth';
import { NavLink } from 'react-router';
import { type NavItem, visibleNavItems } from '../nav-items';

const groupsOf = (items: readonly NavItem[]): [NavItem['group'], NavItem[]][] => {
  const groups = new Map<NavItem['group'], NavItem[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups.entries()];
};

/** Menú lateral filtrado por permisos; agrupado por el trabajo de la persona. */
export function Sidebar({ permissions }: { readonly permissions: readonly PermissionCode[] }) {
  const groups = groupsOf(visibleNavItems(permissions));
  return (
    <nav aria-label="Secciones" className="flex flex-col gap-6">
      {groups.map(([group, items]) => (
        <div key={group}>
          <p id={`nav-${group}`} className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">
            {group}
          </p>
          <ul aria-labelledby={`nav-${group}`} className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `block rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)] ${
                      isActive ? 'bg-white/12 text-white' : 'text-white/75 hover:bg-white/8 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
