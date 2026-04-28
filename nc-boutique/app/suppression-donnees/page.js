export const metadata = {
  title: "Suppression de données — NajmCoiff",
  description: "Comment supprimer vos données personnelles chez NajmCoiff",
};

export default function SuppressionDonnees() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 text-gray-800">
      <h1 className="text-2xl font-bold mb-6">Suppression de vos données</h1>
      <p className="text-sm text-gray-500 mb-8">Dernière mise à jour : avril 2026</p>

      <section className="mb-6">
        <p className="mb-4">Conformément aux lois sur la protection des données, vous pouvez demander la suppression de toutes vos données personnelles stockées par NajmCoiff.</p>
        <p>Cela inclut :</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Votre nom et prénom</li>
          <li>Votre numéro de téléphone</li>
          <li>Votre adresse de livraison</li>
          <li>L'historique de vos commandes</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Comment faire une demande de suppression</h2>
        <p className="mb-3">Envoyez-nous votre demande via l'un de ces canaux :</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>WhatsApp :</strong> Envoyez le message <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">SUPPRIMER MES DONNÉES</code> au numéro affiché sur notre site
          </li>
          <li>
            <strong>Email :</strong> contact@najmcoiff.com avec l'objet <em>"Demande de suppression de données"</em>
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Délai de traitement</h2>
        <p>Votre demande sera traitée dans un délai de <strong>30 jours</strong>. Nous vous enverrons une confirmation une fois vos données supprimées.</p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Note importante</h2>
        <p>La suppression de vos données entraînera également la clôture de votre compte client sur notre boutique. Les données liées à des obligations légales (facturation) peuvent être conservées conformément à la loi.</p>
      </section>
    </main>
  );
}
