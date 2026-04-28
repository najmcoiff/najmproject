export const metadata = {
  title: "Politique de confidentialité — NajmCoiff",
  description: "Politique de confidentialité de NajmCoiff",
};

export default function PolitiqueConfidentialite() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 text-gray-800">
      <h1 className="text-2xl font-bold mb-6">Politique de confidentialité</h1>
      <p className="text-sm text-gray-500 mb-8">Dernière mise à jour : avril 2026</p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">1. Collecte des données</h2>
        <p>NajmCoiff collecte les informations que vous nous fournissez lors de la passation d'une commande (nom, prénom, adresse, numéro de téléphone, wilaya) afin de traiter et livrer vos commandes.</p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">2. Utilisation des données</h2>
        <p>Vos données sont utilisées uniquement pour :</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Traiter et livrer vos commandes</li>
          <li>Vous contacter concernant votre commande via WhatsApp ou téléphone</li>
          <li>Améliorer notre service client</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">3. Partage des données</h2>
        <p>Vos données ne sont jamais vendues ni partagées avec des tiers, sauf avec nos partenaires de livraison (ZR Express) pour l'acheminement de vos colis.</p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">4. Cookies et suivi publicitaire</h2>
        <p>Notre site utilise Meta Pixel pour mesurer les performances de nos campagnes publicitaires. Ces données sont agrégées et anonymisées. Vous pouvez désactiver le suivi via les paramètres de votre navigateur.</p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">5. Vos droits</h2>
        <p>Vous avez le droit de demander la suppression, la modification ou l'accès à vos données personnelles. Pour exercer ces droits, contactez-nous via WhatsApp ou par email.</p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">6. Contact</h2>
        <p>Pour toute question relative à vos données personnelles, contactez-nous à l'adresse : <strong>contact@najmcoiff.com</strong></p>
      </section>
    </main>
  );
}
