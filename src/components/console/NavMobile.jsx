/**
 * NavMobile.jsx - Baikal Console
 * ============================================================================
 * Navigation téléphone (sous `md`, 768px), décidée avec Eric le 08/09/2026 :
 * deux niveaux à leur place au lieu de deux rangées défilantes.
 *
 *   - Le site vit dans l'en-tête : `BoutonSite` (nom + chevron) ouvre une
 *     feuille depuis le bas listant tous les sites, Baikal en tête pour le
 *     super admin, avec le domaine pour distinguer deux sites proches.
 *   - Les modules vivent en bas, sous le pouce : `BarreBasse` fixe avec les
 *     quatre modules du quotidien + « Plus », qui ouvre une feuille avec le
 *     reste (modules secondaires, modules propres au site, réglages,
 *     déconnexion).
 *
 * Le bureau (≥ md) ne passe pas par ici : colonne de sites et barre
 * d'onglets de ConsoleLayout inchangées.
 * ============================================================================
 */
import { useEffect } from 'react';
import { ChevronDown, MoreHorizontal, Settings, LogOut, Shield, Check } from 'lucide-react';

// Modules affichés dans la barre du bas, dans cet ordre, s'ils sont
// ouverts pour la personne et le site. Les autres passent dans « Plus ».
export const PRINCIPAUX_SITE = ['clients', 'finances', 'seo', 'rapports'];
export const PRINCIPAUX_BAIKAL = ['baikal-acces', 'baikal-registre', 'baikal-demandes', 'baikal-metiers'];

/** Feuille depuis le bas : fond assombri, panneau bordé à la hauteur de l'écran. */
function Feuille({ ouverte, onFermer, titre, children }) {
    useEffect(() => {
        if (!ouverte) return undefined;
        const precedent = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => { if (e.key === 'Escape') onFermer(); };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = precedent;
            window.removeEventListener('keydown', onKey);
        };
    }, [ouverte, onFermer]);

    if (!ouverte) return null;
    return (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onFermer}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={titre}
                className="w-full max-h-[80vh] overflow-y-auto bg-baikal-surface border-t border-baikal-border rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-baikal-surface pt-2 pb-2 px-4">
                    <div className="w-9 h-1 rounded-full bg-baikal-border mx-auto mb-3" aria-hidden="true" />
                    <p className="text-xs font-mono uppercase tracking-wider text-baikal-cyan">{titre}</p>
                </div>
                <div className="px-2 pb-4">{children}</div>
            </div>
        </div>
    );
}

function LigneFeuille({ actif, onClick, icone: Icone, children, detail }) {
    return (
        <button
            onClick={onClick}
            aria-current={actif ? 'true' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-left text-sm transition-colors
                ${actif ? 'bg-baikal-cyan/10 text-baikal-cyan' : 'text-white hover:bg-baikal-bg'}`}
        >
            {Icone && <Icone className="w-4 h-4 shrink-0" />}
            <span className="flex-1 min-w-0 truncate">{children}</span>
            {detail && <span className="text-xs font-mono text-baikal-text truncate max-w-[45%]">{detail}</span>}
            {actif && <Check className="w-4 h-4 shrink-0" />}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Bouton de site dans l'en-tête + feuille des sites
// ---------------------------------------------------------------------------
export function BoutonSite({ libelle, ouvert, onToggle }) {
    return (
        <button
            onClick={onToggle}
            aria-expanded={ouvert}
            className="md:hidden flex items-center gap-1.5 min-w-0 px-3 py-2 rounded-md border border-baikal-border bg-baikal-bg text-white text-sm hover:border-baikal-cyan transition-colors"
        >
            <span className="truncate max-w-[40vw]">{libelle}</span>
            <ChevronDown className="w-4 h-4 shrink-0 text-baikal-text" />
        </button>
    );
}

export function FeuilleSites({ ouverte, onFermer, sites, actif, onSelect, baikal, baikalActif, onBaikal }) {
    return (
        <Feuille ouverte={ouverte} onFermer={onFermer} titre="Changer de site">
            {baikal && (
                <>
                    <LigneFeuille actif={baikalActif} icone={Shield} detail="super admin"
                        onClick={() => { onFermer(); onBaikal(); }}>
                        Baikal
                    </LigneFeuille>
                    <div className="my-1 h-px bg-baikal-border" aria-hidden="true" />
                </>
            )}
            {sites.map((site) => (
                <LigneFeuille key={site.id} actif={!baikalActif && site.id === actif} detail={site.domaine || ''}
                    onClick={() => { onFermer(); onSelect(site.id); }}>
                    {site.name}
                </LigneFeuille>
            ))}
        </Feuille>
    );
}

// ---------------------------------------------------------------------------
// Barre du bas + feuille « Plus »
// ---------------------------------------------------------------------------
function BoutonBas({ tab, actif, badge, onClick }) {
    const Icon = tab.icon;
    const isActive = actif === tab.id;
    return (
        <button
            onClick={onClick}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[11px] leading-none transition-colors
                ${isActive ? 'text-baikal-cyan' : 'text-baikal-text hover:text-white'}`}
        >
            <Icon className="w-5 h-5" />
            <span className="truncate max-w-full px-1">{tab.label}</span>
            {badge ? (
                <span className="absolute top-1 right-1/2 translate-x-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded font-mono">
                    {badge}
                </span>
            ) : null}
        </button>
    );
}

/**
 * `principaux` : les modules de la barre (4 au plus). `secondaires` : ceux de
 * la feuille « Plus », par groupe {titre, modules}. `actif` : id du module
 * courant. Si le module actif est dans « Plus », le bouton Plus s'allume.
 */
export function BarreBasse({ principaux, secondaires, actif, badges = {}, onNavigate, plusOuvert, onTogglePlus, onSettings, onSignOut }) {
    const dansPlus = secondaires.some((g) => g.modules.some((m) => m.id === actif));
    const badgePlus = secondaires.reduce((n, g) => n + g.modules.reduce((k, m) => k + (badges[m.id] || 0), 0), 0);

    return (
        <>
            <nav
                aria-label="Modules"
                className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-baikal-surface border-t border-baikal-border pb-[env(safe-area-inset-bottom)]"
            >
                <div className="grid" style={{ gridTemplateColumns: `repeat(${principaux.length + 1}, minmax(0, 1fr))` }}>
                    {principaux.map((tab) => (
                        <BoutonBas key={tab.id} tab={tab} actif={actif} badge={badges[tab.id]}
                            onClick={() => onNavigate(tab.route)} />
                    ))}
                    <BoutonBas
                        tab={{ id: '__plus', label: 'Plus', icon: MoreHorizontal }}
                        actif={dansPlus || plusOuvert ? '__plus' : actif}
                        badge={badgePlus || null}
                        onClick={onTogglePlus}
                    />
                </div>
            </nav>

            <Feuille ouverte={plusOuvert} onFermer={onTogglePlus} titre="Plus">
                {secondaires.filter((g) => g.modules.length > 0).map((groupe) => (
                    <div key={groupe.titre} className="mb-2">
                        <p className="px-3 pt-2 pb-1 text-[11px] text-baikal-text opacity-70">{groupe.titre}</p>
                        <div className="grid grid-cols-2 gap-1">
                            {groupe.modules.map((tab) => (
                                <LigneFeuille key={tab.id} actif={actif === tab.id} icone={tab.icon}
                                    onClick={() => { onTogglePlus(); onNavigate(tab.route); }}>
                                    {tab.label}{badges[tab.id] ? ` (${badges[tab.id]})` : ''}
                                </LigneFeuille>
                            ))}
                        </div>
                    </div>
                ))}
                <div className="mt-2 pt-2 border-t border-baikal-border grid grid-cols-2 gap-1">
                    <LigneFeuille icone={Settings} onClick={() => { onTogglePlus(); onSettings(); }}>Réglages</LigneFeuille>
                    <LigneFeuille icone={LogOut} onClick={() => { onTogglePlus(); onSignOut(); }}>Déconnexion</LigneFeuille>
                </div>
            </Feuille>
        </>
    );
}
