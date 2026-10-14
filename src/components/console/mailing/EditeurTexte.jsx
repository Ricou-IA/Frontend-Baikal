/**
 * EditeurTexte - Mailing
 * ============================================================================
 * Le corps du mail comme dans un traitement de texte : gras, italique, liste,
 * lien, bouton d'action, et variables inserees comme des etiquettes. Le HTML
 * n'est jamais montre (l'outil est pour des utilisateurs, pas des codeurs —
 * Eric, 13/10/2026).
 *
 * Entree / sortie : le HTML restreint que le serveur accepte (p, br, strong,
 * em, ul, ol, li, a[href], a[href][data-bouton]) avec les variables ecrites
 * {{nom}} ou {{nom|repli}}. Dans l'editeur, une variable est une etiquette
 * non editable ; elle redevient {{...}} a la sortie.
 * Le composant n'est pas controle en continu : `valeur` n'est relue que
 * lorsque `version` change (generation par l'IA, ouverture d'une campagne),
 * sinon le curseur sauterait a chaque frappe.
 * ============================================================================
 */
import { useEffect, useRef } from 'react';
import { Bold, Italic, Link2, List, MousePointerClick } from 'lucide-react';

const LIBELLES_VARIABLES = { nom: 'Nom', email: 'Email', commune: 'Commune', site: 'Site' };

function etiquette(nom, repli) {
  const libelle = LIBELLES_VARIABLES[nom] || nom;
  const r = repli !== undefined ? ` data-repli="${repli.replace(/"/g, '&quot;')}"` : '';
  return `<span contenteditable="false" data-var="${nom}"${r} class="variable-mail">${libelle}</span>`;
}

// {{nom|repli}} -> etiquette ; div -> p (le serveur ne garde pas les div).
function versEditeur(html) {
  const source = (html || '').trim() || '<p><br></p>';
  return source.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_m, nom, repli) => etiquette(nom.toLowerCase(), repli));
}

function versHtml(racine) {
  const copie = racine.cloneNode(true);
  copie.querySelectorAll('span[data-var]').forEach((s) => {
    const repli = s.getAttribute('data-repli');
    s.replaceWith(document.createTextNode(`{{${s.getAttribute('data-var')}${repli !== null ? `|${repli}` : ''}}}`));
  });
  copie.querySelectorAll('div').forEach((d) => {
    const p = document.createElement('p');
    p.innerHTML = d.innerHTML;
    d.replaceWith(p);
  });
  copie.querySelectorAll('b').forEach((b) => { const s = document.createElement('strong'); s.innerHTML = b.innerHTML; b.replaceWith(s); });
  copie.querySelectorAll('i').forEach((b) => { const s = document.createElement('em'); s.innerHTML = b.innerHTML; b.replaceWith(s); });
  // Texte nu a la racine (premiere ligne tapee) : dans un paragraphe.
  [...copie.childNodes].forEach((n) => {
    if (n.nodeType === 3 && n.textContent.trim()) {
      const p = document.createElement('p'); p.textContent = n.textContent; n.replaceWith(p);
    }
  });
  return copie.innerHTML.replace(/<p><br><\/p>$/, '');
}

function Outil({ titre, onClick, children, disabled }) {
  return (
    <button
      type="button"
      title={titre}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="p-2 rounded-md text-baikal-text hover:text-white hover:bg-baikal-bg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function EditeurTexte({ valeur, version, onChange, variables = [], disabled }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = versEditeur(valeur);
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const emettre = () => { if (ref.current) onChange(versHtml(ref.current)); };

  function commande(nom, arg) {
    ref.current?.focus();
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand(nom, false, arg);
    emettre();
  }

  function lien() {
    const url = window.prompt('Adresse du lien (https://…)');
    if (!url) return;
    commande('createLink', /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`);
  }

  function bouton() {
    const texte = window.prompt('Texte du bouton', 'Découvrir');
    if (!texte) return;
    const url = window.prompt('Adresse du bouton (https://…)');
    if (!url) return;
    const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    const sur = (x) => x.replace(/[<>"&]/g, '');
    commande('insertHTML', `<p><a href="${sur(href)}" data-bouton>${sur(texte)}</a></p><p><br></p>`);
  }

  function variable(v) {
    commande('insertHTML', `${etiquette(v)}&nbsp;`);
  }

  return (
    <div className={`rounded-md border border-baikal-border bg-white ${disabled ? 'opacity-70' : ''}`}>
      <style>{`
        .editeur-mail p { margin: 0 0 12px; }
        .editeur-mail ul, .editeur-mail ol { margin: 0 0 12px 20px; list-style: disc; }
        .editeur-mail ol { list-style: decimal; }
        .editeur-mail a { color: #2563eb; text-decoration: underline; }
        .editeur-mail a[data-bouton] { display: inline-block; padding: 10px 18px; background: #111827; color: #fff;
          border-radius: 8px; text-decoration: none; font-weight: 600; }
        .editeur-mail .variable-mail { display: inline-block; padding: 0 6px; margin: 0 1px; border-radius: 4px;
          background: #e0f2fe; color: #0369a1; font-size: 13px; font-weight: 600; }
      `}</style>
      <div className="flex items-center gap-1 flex-wrap px-2 py-1 border-b border-gray-200 bg-baikal-surface rounded-t-md">
        <Outil titre="Gras" onClick={() => commande('bold')} disabled={disabled}><Bold className="w-4 h-4" /></Outil>
        <Outil titre="Italique" onClick={() => commande('italic')} disabled={disabled}><Italic className="w-4 h-4" /></Outil>
        <Outil titre="Liste" onClick={() => commande('insertUnorderedList')} disabled={disabled}><List className="w-4 h-4" /></Outil>
        <Outil titre="Lien" onClick={lien} disabled={disabled}><Link2 className="w-4 h-4" /></Outil>
        <Outil titre="Bouton d'action" onClick={bouton} disabled={disabled}><MousePointerClick className="w-4 h-4" /></Outil>
        <span className="w-px h-5 bg-baikal-border mx-1" />
        {variables.map((v) => (
          <button key={v} type="button" disabled={disabled}
            onMouseDown={(e) => e.preventDefault()} onClick={() => variable(v)}
            className="px-2 py-1 rounded text-xs font-medium text-sky-300 border border-sky-500/40 hover:bg-sky-500/10 disabled:opacity-40">
            + {LIBELLES_VARIABLES[v] || v}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emettre}
        onBlur={emettre}
        onPaste={(e) => {
          // Coller = texte seul : jamais la mise en forme d'un autre site.
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
        className="editeur-mail min-h-[280px] px-4 py-3 text-[15px] leading-6 text-gray-900 focus:outline-none"
      />
    </div>
  );
}
