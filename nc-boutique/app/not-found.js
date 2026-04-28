import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-7xl font-bold text-gray-100 mb-2">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Page introuvable</h1>
        <p className="text-gray-500 text-sm mb-8 max-w-sm">
          La page que vous recherchez n'existe pas ou a été déplacée.
        </p>
        <div className="flex gap-3 flex-col sm:flex-row">
          <Link
            href="/"
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-8 rounded-full transition-colors"
          >
            Retour à l'accueil
          </Link>
          <Link
            href="/produits"
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-3 px-8 rounded-full transition-colors"
          >
            Voir le catalogue
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
