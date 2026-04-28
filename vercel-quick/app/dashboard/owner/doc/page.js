import { readFile } from "fs/promises";
import path from "path";

// Convertit le Markdown en HTML simple (sans lib externe)
function mdToHtml(md) {
  return md
    // Titres
    .replace(/^#### (.+)$/gm, '<h4 class="text-base font-bold text-gray-800 mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm,  '<h3 class="text-lg font-bold text-gray-900 mt-6 mb-2 border-b border-gray-100 pb-1">$1</h3>')
    .replace(/^## (.+)$/gm,   '<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3 pt-4 border-t-2 border-gray-200">$1</h2>')
    .replace(/^# (.+)$/gm,    '<h1 class="text-2xl font-bold text-gray-900 mb-4">$1</h1>')
    // Code inline
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-red-600 text-xs px-1.5 py-0.5 rounded font-mono">$1</code>')
    // Gras + italique
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Liens
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>')
    // Lignes de tableau (simplifié)
    .replace(/^\|(.+)\|$/gm, (_, cells) => {
      const ths = cells.split("|").map(c => c.trim()).filter(Boolean);
      if (ths.every(c => /^[-:]+$/.test(c))) return ""; // séparateur
      return '<tr>' + ths.map(c => `<td class="px-3 py-1.5 text-sm border-b border-gray-100">${c}</td>`).join("") + '</tr>';
    })
    // Blocs de code
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre class="bg-gray-900 text-green-400 text-xs p-4 rounded-xl overflow-x-auto my-3 font-mono leading-relaxed">$1</pre>')
    // Listes
    .replace(/^- (.+)$/gm, '<li class="text-sm text-gray-700 ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="text-sm text-gray-700 ml-4 list-decimal">$1</li>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-amber-400 pl-4 text-sm text-gray-600 italic my-2">$1</blockquote>')
    // Lignes horizontales
    .replace(/^---$/gm, '<hr class="border-gray-200 my-6" />')
    // Paragraphes (lignes non vides non encore converties)
    .replace(/^(?!<[hHlbBpPtiTc])([^\n].+)$/gm, '<p class="text-sm text-gray-700 leading-relaxed my-1">$1</p>')
    // Lignes vides
    .replace(/\n\n/g, '<div class="mb-2"></div>');
}

export default async function OwnerDocPage() {
  let content = "";
  let error = null;

  try {
    // Lire PLAN.md depuis la racine du projet (on remonte depuis vercel-quick)
    const planPath = path.join(process.cwd(), "..", "nc-boutique", "PLAN.md");
    const raw = await readFile(planPath, "utf-8");
    content = mdToHtml(raw);
  } catch (e) {
    // Fallback : essayer depuis le repo root
    try {
      const planPath2 = path.join(process.cwd(), "nc-boutique", "PLAN.md");
      const raw = await readFile(planPath2, "utf-8");
      content = mdToHtml(raw);
    } catch {
      error = "Impossible de charger PLAN.md — vérifiez le chemin du fichier.";
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-gray-900">📄 Documentation — PLAN.md</h1>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full font-mono">
          nc-boutique/PLAN.md
        </span>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">
          {error}
        </div>
      ) : (
        <div
          className="bg-white rounded-2xl border border-gray-100 p-6 overflow-auto"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
    </div>
  );
}
