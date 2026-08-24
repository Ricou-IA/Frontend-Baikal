/**
 * SiteSidebar.jsx - Baikal Console
 * ============================================================================
 * Selection du site courant : colonne de gauche en desktop (liste toujours
 * visible, sticky sous le header), rangee defilante en dessous de `xl`
 * (1280px). Remplace le dropdown qui vivait dans le header.
 *
 * Le site actif pilote toute la console (modules affiches + donnees des
 * pages) : il est donc traite comme une navigation, pas comme un champ.
 * ============================================================================
 */

/** Colonne de gauche (>= xl). */
export default function SiteSidebar({ sites, actif, onSelect }) {
    if (!sites || sites.length === 0) return null;

    return (
        <aside className="hidden xl:flex xl:flex-col self-start sticky top-16 h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-baikal-border bg-baikal-surface/40">
            <p className="px-6 pt-6 pb-3 text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-baikal-text/60">
                Sites
            </p>
            <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
                {sites.map((site) => {
                    const estActif = site.id === actif;
                    return (
                        <button
                            key={site.id}
                            onClick={() => onSelect(site.id)}
                            aria-current={estActif ? 'true' : undefined}
                            className={`group w-full block rounded-md border-l-2 py-2.5 pl-2.5 pr-2 text-left transition-colors
                                ${estActif
                                    ? 'border-baikal-cyan bg-baikal-cyan/10'
                                    : 'border-transparent hover:bg-baikal-bg/70'}`}
                        >
                            <span className={`block truncate text-sm font-medium transition-colors
                                ${estActif ? 'text-baikal-cyan' : 'text-white/80 group-hover:text-white'}`}>
                                {site.name}
                            </span>
                            {site.domaine && (
                                <span className="block truncate text-xs font-mono text-baikal-text/70">
                                    {site.domaine}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>
            <p className="px-6 py-3 border-t border-baikal-border text-[11px] font-mono text-baikal-text/50">
                {sites.length} site{sites.length > 1 ? 's' : ''}
            </p>
        </aside>
    );
}

/** Repli sous `xl` : rangee horizontale defilante. */
export function SiteBarre({ sites, actif, onSelect }) {
    if (!sites || sites.length === 0) return null;

    return (
        <div className="xl:hidden bg-baikal-surface/60 border-b border-baikal-border">
            <div className="flex gap-2 overflow-x-auto px-4 py-2 sm:px-6">
                {sites.map((site) => {
                    const estActif = site.id === actif;
                    return (
                        <button
                            key={site.id}
                            onClick={() => onSelect(site.id)}
                            aria-current={estActif ? 'true' : undefined}
                            className={`px-3 py-1.5 rounded-md border text-sm whitespace-nowrap transition-colors
                                ${estActif
                                    ? 'border-baikal-cyan text-baikal-cyan bg-baikal-cyan/10'
                                    : 'border-baikal-border text-baikal-text hover:text-white'}`}
                        >
                            {site.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
