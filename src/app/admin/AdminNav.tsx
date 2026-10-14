"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation de l'espace cuisine, en bas de l'écran.
 *
 * En bas et non en haut: sur un téléphone tenu d'une seule main, le haut de
 * l'écran demande de déplacer la paume. Les deux seules destinations de cet
 * espace tiennent donc sous le pouce, à hauteur constante, quelle que soit la
 * position dans une longue liste de commandes.
 */

const TABS = [
  { href: "/admin", label: "Commandes" },
  { href: "/admin/reglages", label: "Réglages" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Espace cuisine"
      className="rule-t fixed inset-x-0 bottom-0 z-30 bg-bone pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`label flex min-h-16 items-center justify-center ${
                  active ? "text-olive" : "text-muted"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
