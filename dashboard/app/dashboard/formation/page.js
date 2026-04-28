"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";

// ═══════════════════════════════════════════════════════════════════
//  DONNÉES DE FORMATION — organisées par page (pas par rôle)
// ═══════════════════════════════════════════════════════════════════

const SECTIONS = [
  // ─────────────────── NAVIGATION ────────────────────────────────
  {
    id: "navigation",
    icon: "🗺️",
    title: "Interface & Navigation",
    color: "gray",
    desc: "Tout ce qui est visible en permanence : sidebar, barre du haut, badges, notifications.",
    subsections: [
      {
        id: "sidebar",
        title: "La Sidebar (barre de navigation gauche)",
        icon: "◀️",
        content: `La sidebar est la colonne gauche blanche qui liste toutes les pages du dashboard.
Sur mobile elle se cache — appuie sur l'icône ☰ (hamburger) en haut à gauche pour l'ouvrir.`,
        mockup: {
          type: "sidebar",
          items: [
            { icon: "🏠", label: "Accueil", active: false },
            { icon: "✅", label: "Confirmation", active: true, note: "Page active = fond noir" },
            { icon: "📦", label: "Préparation", active: false },
            { icon: "🚚", label: "Suivi ZR", active: false },
            { icon: "🚧", label: "Barrage", active: false },
            { icon: "📋", label: "Stock", active: false },
            { icon: "📚", label: "Catalogue", active: false },
            { icon: "🗂️", label: "Collections", active: false },
            { icon: "🖥️", label: "POS Comptoir", active: false },
            { icon: "🛒", label: "Achats", active: false },
            { icon: "💰", label: "Finance", active: false },
            { icon: "📊", label: "Rapport", active: false, badge: "3" },
            { icon: "💬", label: "Discussions", active: false, badge: "7" },
            { icon: "🔔", label: "Notifications", active: false },
            { icon: "🗂️", label: "Organisation", active: false },
            { icon: "🎬", label: "Créatif", active: false },
            { icon: "⚡", label: "Opérations", active: false },
            { icon: "🏥", label: "BI (Owner)", active: false },
            { icon: "📱", label: "Campagnes (Owner)", active: false },
            { icon: "🎓", label: "Formation", active: false },
            { icon: "👤", label: "Utilisateurs", active: false },
          ],
        },
        details: [
          { label: "Page active", desc: "Fond noir + texte blanc sur l'élément actif — tu sais toujours où tu es." },
          { label: "Badge rouge", desc: "Un chiffre en rouge sur Rapport ou Discussions = éléments non lus depuis ta dernière visite. Le badge disparaît quand tu ouvres la page." },
          { label: "Carte utilisateur (bas de sidebar)", desc: "Affiche ton nom, ton rôle (agent/responsable/owner), et le bouton de déconnexion." },
          { label: "Bouton 'Installer l'application'", desc: "Sur Chrome / Edge Android, un bouton 📲 apparaît pour installer le dashboard comme une vraie application (PWA) sur ton téléphone. Appuie dessus, puis 'Ajouter à l'écran d'accueil'." },
          { label: "← Déconnexion", desc: "En bas de la sidebar. Te déconnecte et efface la session. La session dure automatiquement 8 heures." },
        ],
      },
      {
        id: "topbar",
        title: "La Barre du Haut (topbar)",
        icon: "⬆️",
        content: "La barre blanche en haut de chaque page. Elle contient : l'icône menu mobile, le titre de la page courante, la date du jour, et la cloche de notifications.",
        mockup: { type: "topbar" },
        details: [
          { label: "☰ Menu (mobile uniquement)", desc: "Ouvre/ferme la sidebar. N'existe que sur mobile." },
          { label: "Titre de page", desc: "Indique la page sur laquelle tu es (ex : 'Confirmation', 'Stock', etc.)." },
          { label: "Date (masquée sur mobile)", desc: "Date du jour en français (ex : mar. 14 avr.)." },
          { label: "🔔 Cloche de notifications", desc: "Ouvre un panneau dropdown avec les 50 dernières notifications du système. Un point rouge indique les non lues. Les types possibles : 💬 mention, 📊 rapport, 📌 note, 📸 shooting, 📦 retour, 🔔 général." },
        ],
      },
      {
        id: "push",
        title: "Bannière Notifications Push",
        icon: "🔔",
        content: "Si une bannière jaune apparaît sous la topbar, c'est une invitation à activer les notifications push sur ton appareil. Ces notifications arrivent même quand le dashboard n'est pas ouvert.",
        details: [
          { label: "Bouton 'Activer'", desc: "Accepte la demande de permission de ton navigateur. Tu recevras désormais des alertes en temps réel (nouvelles commandes, rapports, etc.)." },
          { label: "Bouton 'Plus tard'", desc: "Ferme la bannière temporairement. Elle réapparaîtra à la prochaine session." },
        ],
      },
    ],
  },

  // ─────────────────── CONFIRMATION ──────────────────────────────
  {
    id: "confirmation",
    icon: "✅",
    title: "Confirmation",
    color: "green",
    desc: "Page centrale de gestion des commandes en ligne. Confirmer, annuler, modifier, suivre — tout se passe ici.",
    subsections: [
      {
        id: "conf-onglets",
        title: "Les Onglets de Filtrage",
        icon: "🗂️",
        content: "En haut de la page, 7 onglets permettent de filtrer les commandes rapidement.",
        mockup: {
          type: "tabs",
          tabs: [
            { label: "Tous", active: false },
            { label: "À traiter", active: true, note: "Commandes sans décision" },
            { label: "Confirmés", active: false },
            { label: "Annulés", active: false },
            { label: "À modifier", active: false },
            { label: "Rappel", active: false },
            { label: "🧾 POS", active: false, note: "Commandes caisse" },
          ],
        },
        details: [
          { label: "Tous", desc: "Affiche toutes les commandes en ligne (NC boutique + anciennes) sauf les commandes POS." },
          { label: "À traiter", desc: "Commandes sans decision_status — celles qui attendent un appel. Commence TOUJOURS par cet onglet chaque matin." },
          { label: "Confirmés", desc: "Commandes avec decision_status = 'confirmer'. Prêtes à être préparées." },
          { label: "Annulés", desc: "Commandes annulées (refus client, faux numéro, doublon, etc.)." },
          { label: "À modifier", desc: "Commandes avec decision_status = 'modifier' — une modification d'adresse, prix ou article est en attente." },
          { label: "Rappel", desc: "Commandes avec contact_status = 'rappel' — le client a demandé à être rappelé." },
          { label: "🧾 POS", desc: "Commandes créées depuis la caisse POS Comptoir. Affichage séparé." },
        ],
      },
      {
        id: "conf-recherche",
        title: "Barre de Recherche Intelligente",
        icon: "🔍",
        content: "La barre de recherche en haut accepte n'importe quel texte. Elle cherche simultanément dans : le nom client, le numéro de téléphone, l'ID commande, la wilaya, la commune, l'adresse, le numéro de suivi ZR.",
        details: [
          { label: "Recherche multi-champs", desc: "Tapez '06 12' → toutes les commandes dont le téléphone contient '06 12'. Tapez 'Alger' → toutes les commandes de la wilaya Alger." },
          { label: "Recherche fuzzy (tolérante aux fautes)", desc: "Tapez 'cofeur' → trouve 'coiffeur'. Le moteur tolère les fautes de frappe légères." },
          { label: "Multi-tokens", desc: "Tapez 'alger ahmed' → commandes de Ahmed à Alger. Plusieurs mots = filtre combiné." },
        ],
      },
      {
        id: "conf-carte",
        title: "Anatomie d'une Carte Commande",
        icon: "🃏",
        content: "Chaque commande est représentée par une carte. Voici chaque zone expliquée.",
        mockup: {
          type: "order-card",
        },
        details: [
          { label: "Numéro de commande (ex: NC-2847)", desc: "Identifiant unique de la commande dans le système. Format NC-XXXX pour les commandes boutique en ligne. Les commandes POS affichent POS-XXXX." },
          { label: "Nom du client", desc: "Prénom et nom tels que saisis dans le formulaire de commande." },
          { label: "📞 Téléphone", desc: "Numéro principal du client. Clique dessus sur mobile pour appeler directement." },
          { label: "📍 Wilaya / Commune", desc: "Adresse de livraison. Visible sur la carte pour repérer rapidement." },
          { label: "🛍️ Articles", desc: "Liste résumée des articles commandés (quantités + noms)." },
          { label: "💰 Montant total", desc: "Prix total de la commande en DA, frais de livraison inclus." },
          { label: "Badge de statut coloré", desc: "Voir section suivante — explique l'état de la commande." },
          { label: "Icônes d'alerte", desc: "Petites icônes à droite du badge — chacune a une signification précise (voir section suivante)." },
          { label: "Date et heure", desc: "Quand la commande a été passée sur la boutique." },
        ],
      },
      {
        id: "conf-badges",
        title: "Badges de Statut — Ce que chaque couleur signifie",
        icon: "🏷️",
        content: "Le badge coloré sur chaque carte indique l'état de traitement de la commande.",
        mockup: {
          type: "badges",
          badges: [
            { label: "CONFIRMÉ", color: "bg-green-100 text-green-700", desc: "Le client a confirmé sa commande par téléphone." },
            { label: "ANNULÉ", color: "bg-red-100 text-red-700", desc: "La commande est annulée (refus, injoignable, doublon...)." },
            { label: "MODIFIÉ", color: "bg-blue-100 text-blue-700", desc: "Une modification est en cours (adresse, produit, etc.)." },
            { label: "RAPPEL", color: "bg-yellow-100 text-yellow-700", desc: "Le client a demandé à être rappelé plus tard." },
            { label: "INJOIGNABLE T1", color: "bg-orange-100 text-orange-700", desc: "Premier essai sans réponse." },
            { label: "INJOIGNABLE T2", color: "bg-orange-100 text-orange-700", desc: "Deuxième essai sans réponse → prendre une décision." },
            { label: "DOUBLON", color: "bg-purple-100 text-purple-700", desc: "Ce numéro de téléphone existe dans plusieurs commandes." },
            { label: "(vide)", color: "bg-gray-100 text-gray-500", desc: "Commande sans aucune décision — à traiter en priorité." },
          ],
        },
        details: [],
      },
      {
        id: "conf-icons",
        title: "Icônes d'Alerte — Signification exacte",
        icon: "⚡",
        content: "Des petites icônes apparaissent à côté du badge de statut. Chacune est un signal important.",
        mockup: {
          type: "alert-icons",
          icons: [
            { icon: "⚠️", label: "Doublon", desc: "Ce numéro de téléphone apparaît dans une autre commande. Appelle les deux avant de confirmer l'une d'elles." },
            { icon: "✅", label: "Préparée", desc: "Le préparateur a déjà mis ce colis de côté. Ne plus modifier les articles." },
            { icon: "🗓️", label: "Clôturée hier", desc: "Commande d'avant-hier ou plus. Attention : le livreur est peut-être déjà parti avec." },
            { icon: "🖨️", label: "Tracking ZR", desc: "Un numéro de suivi ZR Express existe — le colis a été injecté dans le système de livraison." },
            { icon: "♻️", label: "À modifier", desc: "Cette commande est en statut 'modifier' — une correction est attendue." },
            { icon: "🤎", label: "Colis gros", desc: "Le poids ou la taille du colis dépasse le standard ZR. Frais supplémentaires possibles." },
            { icon: "🏷️", label: "Coupon appliqué", desc: "Un code promo a été appliqué sur cette commande. Vérifier le montant final." },
            { icon: "🔴", label: "Sync erreur", desc: "Problème de synchronisation. Contacter le responsable technique." },
            { icon: "🟢", label: "Sync OK", desc: "Commande synchronisée correctement dans tous les systèmes." },
          ],
        },
        details: [],
      },
      {
        id: "conf-actions",
        title: "Les Actions sur une Commande",
        icon: "🎬",
        content: "Clique sur une carte pour ouvrir le modal de détail. Voici toutes les actions disponibles.",
        mockup: {
          type: "actions",
          actions: [
            { label: "✅ Confirmer", color: "bg-green-600 text-white", desc: "Le client a dit OUI. Le statut passe à CONFIRMÉ. La commande apparaît ensuite dans Préparation." },
            { label: "❌ Annuler", color: "bg-red-600 text-white", desc: "Le client refuse ou est injoignable définitivement. Choisir la raison d'annulation." },
            { label: "✏️ Modifier", color: "bg-blue-600 text-white", desc: "Le client veut changer quelque chose. Choisir ce qui change : adresse / prix / produit / numéro de téléphone." },
            { label: "📞 Injoignable 1ère", color: "bg-orange-500 text-white", desc: "Tu as appelé, pas de réponse. Réessaie plus tard dans la journée." },
            { label: "📞 Injoignable 2ème", color: "bg-orange-700 text-white", desc: "Deuxième tentative sans réponse. Décide : annuler ou rappeler." },
            { label: "🔄 Rappel", color: "bg-yellow-500 text-white", desc: "Le client demande à être rappelé (il est occupé, au travail, etc.)." },
          ],
        },
        details: [
          { label: "Raisons d'annulation", desc: "refus_client · injoignable · doublon · mauvaise_adresse · faux numéro · produit_indisponible · autre. Choisis la bonne raison — elle sert pour les statistiques." },
          { label: "Types de modification", desc: "adresse · prix · produit · numéro de téléphone. Si c'est un produit → utilise 'Modifier les articles'." },
          { label: "Type de client", desc: "Choisir parmi : autres / coiffeur_homme / ongleriste / toppik. Sert pour les analytics." },
          { label: "Note interne", desc: "Zone de texte libre visible uniquement par les agents. Jamais envoyée au client." },
          { label: "Modifier les articles", desc: "Bouton spécial qui ouvre un modal pour changer les articles, quantités et prix. Les stocks sont recalculés automatiquement." },
          { label: "Modifier info client", desc: "Permet de corriger le nom, téléphone, wilaya, commune, adresse, type de livraison et prix de livraison." },
          { label: "Supprimer la commande (owner)", desc: "Supprime définitivement la commande ET remet les articles en stock. Action réservée au owner." },
          { label: "Injecter ZR Express", desc: "Envoie la commande au système ZR Express → génère un numéro de suivi (tracking). Apparaît l'icône 🖨️ sur la carte." },
        ],
      },
      {
        id: "conf-sync",
        title: "Rafraîchissement Automatique",
        icon: "🔄",
        content: "La page se rafraîchit automatiquement toutes les 30 secondes. Tu peux aussi appuyer sur le bouton 🔄 (si présent) pour forcer un rechargement immédiat.",
        details: [
          { label: "Pourquoi ?", desc: "Plusieurs agents travaillent en même temps. Le rafraîchissement garantit que tu vois les modifications des collègues en temps réel." },
          { label: "La page ne se réinitialise pas", desc: "Le filtre actif (onglet), la recherche, et les modals ouverts restent en place lors du rafraîchissement silencieux." },
        ],
      },
    ],
  },

  // ─────────────────── PRÉPARATION ───────────────────────────────
  {
    id: "preparation",
    icon: "📦",
    title: "Préparation",
    color: "purple",
    desc: "Liste des commandes confirmées à préparer physiquement. Chaque commande détaille les articles à inclure dans le colis.",
    subsections: [
      {
        id: "prep-liste",
        title: "La Liste des Commandes à Préparer",
        icon: "📋",
        content: "La page affiche toutes les commandes avec statut 'confirmé' et statut_preparation ≠ 'préparée'. Elles sont triées par priorité.",
        details: [
          { label: "Numéro de commande + client", desc: "Identifiant unique + nom du destinataire. Vérifie que le nom sur le colis correspond." },
          { label: "Articles détaillés", desc: "Chaque article avec sa quantité exacte, son nom complet, et si applicable : la taille et la couleur." },
          { label: "Prix total + livraison", desc: "Montant total que le livreur doit encaisser (COD — Cash On Delivery)." },
          { label: "Wilaya / Commune", desc: "Destination finale du colis. Utile pour regrouper par zone de livraison." },
        ],
      },
      {
        id: "prep-quota",
        title: "Quota Journalier",
        icon: "🎯",
        content: "En haut de la page, ton quota du jour est affiché (si configuré par le responsable). Il indique combien de commandes tu dois préparer aujourd'hui.",
        details: [
          { label: "Barre de progression", desc: "Montre l'avancement : X commandes préparées sur Y assignées." },
          { label: "Objectif non atteint", desc: "Si tu n'atteins pas ton quota, signale le dans la page Rapport avec la catégorie 'Problème préparation'." },
        ],
      },
      {
        id: "prep-marquer",
        title: "Marquer une Commande comme Préparée",
        icon: "✅",
        content: "Quand le colis est physiquement emballé et prêt, clique sur 'Marquer préparée'.",
        details: [
          { label: "Effet immédiat", desc: "L'icône ✅ apparaît sur la carte correspondante dans la page Confirmation — les collègues voient que la commande est prête." },
          { label: "La commande disparaît", desc: "Elle quitte la liste Préparation pour laisser la place aux commandes restantes." },
          { label: "Attention", desc: "Ne marque pas 'préparée' si tu n'as pas tous les articles. Si un article manque → signale via Rapport d'abord." },
        ],
      },
      {
        id: "prep-modal-produit",
        title: "Modal Détail Produit",
        icon: "🔍",
        content: "Clique sur l'image ou le nom d'un article dans la liste pour ouvrir un modal avec la photo en grand, la description complète, le stock disponible, et le prix.",
        details: [
          { label: "Photo agrandie", desc: "Zoom sur l'image du produit — utile pour vérifier l'article exact à prendre en stock." },
          { label: "Stock disponible", desc: "Affiche le stock restant dans nc_variants. Si 0 → signaler immédiatement." },
          { label: "SKU / Référence", desc: "Code de référence interne — sert à localiser l'article dans l'entrepôt." },
        ],
      },
    ],
  },

  // ─────────────────── SUIVI ZR ──────────────────────────────────
  {
    id: "suivi-zr",
    icon: "🚚",
    title: "Suivi ZR Express",
    color: "blue",
    desc: "Suivi en temps réel des colis envoyés via ZR Express. Chaque colis affiche son historique complet d'états.",
    subsections: [
      {
        id: "zr-carte",
        title: "Anatomie d'une Carte Colis",
        icon: "📬",
        content: "Chaque colis est représenté par une carte avec fond noir (en-tête) et corps blanc.",
        details: [
          { label: "Nom du client (en-tête noir)", desc: "Destinataire du colis — identique à la commande." },
          { label: "Numéro de tracking (monospace)", desc: "Code unique ZR Express (ex: ZR-2025-XXXXXX). Ce code permet de suivre sur zrexpress.app aussi." },
          { label: "Réf interne", desc: "Identifiant de la commande NC dans notre système (NC-XXXX)." },
          { label: "Badge de statut coloré", desc: "Voir section suivante." },
          { label: "Badge 'Terminé'", desc: "Apparaît quand l'état est final (livré, retourné, perdu). Ce colis peut être archivé." },
          { label: "Téléphone 1 / 2", desc: "Numéros du destinataire — ZR peut les appeler pour coordonner la livraison." },
          { label: "Wilaya / Commune / Adresse", desc: "Adresse de livraison telle qu'envoyée à ZR." },
          { label: "Valeur déclarée", desc: "Montant COD (Cash On Delivery) — ce que le livreur encaisse." },
          { label: "Date injection", desc: "Quand le colis a été envoyé à ZR Express depuis le dashboard." },
          { label: "Historique (timeline)", desc: "Tous les événements du colis dans l'ordre chronologique (créé → expédié → en livraison → livré)." },
        ],
      },
      {
        id: "zr-statuts",
        title: "Couleurs de Statuts ZR",
        icon: "🎨",
        content: "Chaque statut a une couleur pour identifier d'un coup d'œil l'état d'un colis.",
        mockup: {
          type: "zr-statuts",
          statuts: [
            { color: "bg-green-100 text-green-800", dot: "bg-green-500", label: "Livré / Encaissé / Recouvré" },
            { color: "bg-purple-100 text-purple-800", dot: "bg-purple-500", label: "En livraison / Au bureau" },
            { color: "bg-blue-100 text-blue-800", dot: "bg-blue-500", label: "En transit / Collecté / Expédié / Créé / Assigné" },
            { color: "bg-orange-100 text-orange-800", dot: "bg-orange-500", label: "Tentative échouée" },
            { color: "bg-red-100 text-red-800", dot: "bg-red-500", label: "Retourné / Annulé" },
            { color: "bg-gray-100 text-gray-600", dot: "bg-gray-400", label: "Statut inconnu" },
          ],
        },
        details: [],
      },
      {
        id: "zr-filtres",
        title: "Filtres et Onglets",
        icon: "🗂️",
        content: "La page Suivi ZR a plusieurs onglets de filtrage pour gérer les colis.",
        details: [
          { label: "Actifs", desc: "Colis en cours — n'ont pas encore atteint un état final. C'est l'onglet par défaut." },
          { label: "Terminés", desc: "Colis avec état final (livré, retourné, perdu). Masqués par défaut pour ne pas surcharger la vue." },
          { label: "Tous", desc: "Tous les colis sans exception." },
          { label: "Tri par date injection", desc: "Les plus récents en premier. Tu vois les nouvelles injections en haut." },
          { label: "🔄 Bouton Actualiser", desc: "Force un rechargement depuis ZR Express. Utile quand tu attends une mise à jour d'un colis spécifique." },
        ],
      },
      {
        id: "zr-onglet-recherche",
        title: "Onglet Recherche ZR Live",
        icon: "🔎",
        content: "Un onglet spécial permet de chercher un colis directement sur les serveurs ZR Express en temps réel, sans passer par notre base de données.",
        details: [
          { label: "Recherche par tracking", desc: "Saisis le numéro ZR → les données en direct depuis ZR sont affichées (plus fraîches que notre base)." },
          { label: "Recherche par nom ou téléphone", desc: "ZR permet aussi de chercher par nom de destinataire ou numéro de téléphone." },
          { label: "Utilité", desc: "Utile quand un client t'appelle et veut des nouvelles fraîches de son colis, ou en cas de doute sur l'état." },
        ],
      },
    ],
  },

  // ─────────────────── BARRAGE ───────────────────────────────────
  {
    id: "barrage",
    icon: "🚧",
    title: "Barrage (Correction Stock)",
    color: "amber",
    desc: "Outil de correction des niveaux de stock en masse. Permet de définir les stocks cibles et de les appliquer directement dans la base de données.",
    subsections: [
      {
        id: "barrage-principe",
        title: "Principe du Barrage",
        icon: "📖",
        content: "Le barrage est un processus de vérification physique des stocks. On compare le stock réel en rayon avec le stock enregistré dans le système, puis on corrige les écarts.",
        details: [
          { label: "Quand utiliser ?", desc: "En fin de semaine ou après réception d'une livraison. Aussi quand on suspecte des erreurs de stock (commandes impossible à préparer, articles introuvables)." },
          { label: "Filtre Coiffure / Onglerie", desc: "Boutons en haut pour limiter la correction à un seul monde. Ne corrige que ce que tu as physiquement compté." },
          { label: "Résultat", desc: "Les corrections sont appliquées directement dans nc_variants (table Supabase). Le stock est mis à jour en temps réel." },
        ],
      },
      {
        id: "barrage-carte",
        title: "Carte Produit dans le Barrage",
        icon: "🃏",
        content: "Chaque produit apparaît avec son stock actuel dans le système et un champ pour saisir le stock réel.",
        details: [
          { label: "Nom du produit", desc: "Nom exact dans notre catalogue." },
          { label: "Stock système actuel", desc: "Quantité enregistrée dans nc_variants. C'est la référence avant correction." },
          { label: "Champ 'Stock cible'", desc: "Saisis la quantité réelle que tu as comptée physiquement. Laisse vide si aucune correction n'est nécessaire." },
          { label: "Note (optionnel)", desc: "Ajoute une note pour expliquer l'écart (ex: 'colis reçu non enregistré', 'produit endommagé')." },
          { label: "Bouton 'Valider les corrections'", desc: "Applique TOUTES les corrections saisies en une seule opération. IRRÉVERSIBLE — vérifier chaque valeur avant de valider." },
        ],
      },
    ],
  },

  // ─────────────────── STOCK ─────────────────────────────────────
  {
    id: "stock",
    icon: "📋",
    title: "Stock",
    color: "slate",
    desc: "Vue complète du catalogue avec niveaux de stock. Recherche ultra-puissante, bons de commande, et alertes rupture.",
    subsections: [
      {
        id: "stock-liste",
        title: "La Liste des Variantes",
        icon: "📋",
        content: "Chaque ligne représente une variante produit (exemple : 'Toppik Noir 55g'). Triée par date d'ajout (plus récent en premier).",
        details: [
          { label: "Photo produit", desc: "Miniature de l'image. Clique pour zoomer (lightbox)." },
          { label: "Nom du produit / variante", desc: "Nom complet. Peut contenir le monde (Coiffure ou Onglerie) et les caractéristiques (taille, couleur)." },
          { label: "SKU", desc: "Code de référence interne unique — sert pour les bons de commande et le POS." },
          { label: "Barcode", desc: "Code-barres EAN du produit. Scannable via le POS." },
          { label: "Stock", desc: "Quantité disponible en temps réel. Rouge = 0 ou négatif (rupture critique). Jaune = seuil d'alerte dépassé." },
          { label: "Prix de vente", desc: "Prix public en DA — tel qu'affiché sur la boutique." },
          { label: "Prix barré", desc: "Ancien prix affiché barré sur la boutique (promotion). Vide = pas de promo." },
          { label: "Prix d'achat (cost_price)", desc: "Prix payé au fournisseur. Confidentiel — visible uniquement sur les pages Catalogue et Stock." },
          { label: "Collections", desc: "Badges des collections dans lesquelles ce produit apparaît (ex: Coiffure · Toppik)." },
          { label: "Statut (active/archived)", desc: "'active' = visible sur la boutique. 'archived' = masqué de la boutique mais conservé en base." },
          { label: "synced_at", desc: "Date de dernière mise à jour dans le système." },
        ],
      },
      {
        id: "stock-recherche",
        title: "Recherche dans le Stock",
        icon: "🔍",
        content: "La barre de recherche cherche dans : nom, SKU, barcode, collection, wilaya (si applicable). Même moteur fuzzy que la page Confirmation.",
        details: [
          { label: "Tapez 'toppik'", desc: "→ tous les produits Toppik." },
          { label: "Tapez 'noir 55'", desc: "→ variantes noires de 55g." },
          { label: "Tapez partiel 'topik'", desc: "→ trouve 'Toppik' grâce au fuzzy search." },
          { label: "Tapez un SKU", desc: "→ trouve exactement le produit par sa référence." },
        ],
      },
      {
        id: "stock-boc",
        title: "Bon de Commande (BOC)",
        icon: "📝",
        content: "Un bon de commande enregistre une commande fournisseur. Il sert de référence pour l'injection de stock une fois les produits reçus.",
        details: [
          { label: "Bouton '+ Panier' sur un produit", desc: "Ajoute le produit au panier BOC en cours de création. Un panneau latéral s'ouvre." },
          { label: "Panneau panier BOC", desc: "Liste des produits sélectionnés. Pour chaque article : saisir la quantité commandée et le prix d'achat unitaire." },
          { label: "Bouton 'Créer le bon de commande'", desc: "Enregistre le BOC dans nc_po_lines. Un numéro PO-XXXX est généré automatiquement." },
          { label: "Section 'Bons de commande'", desc: "En bas de la page Stock, liste tous les BOC existants avec leur statut (en attente / injecté)." },
          { label: "Injecter le stock", desc: "Quand les produits arrivent physiquement → trouver le BOC → cliquer 'Injecter'. Les quantités sont ajoutées dans nc_variants automatiquement." },
        ],
      },
    ],
  },

  // ─────────────────── CATALOGUE ─────────────────────────────────
  {
    id: "catalogue",
    icon: "📚",
    title: "Catalogue",
    color: "indigo",
    desc: "Gestion complète des produits et variantes. Créer, modifier, désactiver, supprimer, uploader des photos.",
    subsections: [
      {
        id: "cat-liste",
        title: "Liste des Produits",
        icon: "📋",
        content: "Même affichage que Stock mais avec les actions d'édition disponibles. Accessible à tous les agents.",
        details: [
          { label: "Filtres", desc: "Par monde (Coiffure / Onglerie), par statut (actif / archivé / tous), par collection. Combinables." },
          { label: "Tri", desc: "Par date d'ajout (défaut), par nom A-Z, par stock, par prix." },
          { label: "Nombre de produits", desc: "Affiché en haut (ex: '342 variantes')." },
        ],
      },
      {
        id: "cat-creer",
        title: "Créer une Variante",
        icon: "➕",
        content: "Clique sur '+ Nouvelle variante' pour ouvrir le formulaire de création.",
        details: [
          { label: "Titre du produit", desc: "Nom affiché sur la boutique et dans le dashboard. Doit être clair et précis." },
          { label: "Titre de la variante", desc: "Caractéristique spécifique (ex: 'Noir 55g', 'Brun 150ml'). Peut être vide si le produit n'a qu'une seule version." },
          { label: "SKU", desc: "Référence interne. Format libre. Doit être unique." },
          { label: "Barcode (EAN)", desc: "Code-barres physique du produit. Scannable par le POS." },
          { label: "Prix de vente", desc: "En DA — affiché sur la boutique." },
          { label: "Prix barré", desc: "Mettre l'ancien prix si promo. Laisser 0 sinon." },
          { label: "Prix d'achat", desc: "Coût fournisseur. Non visible sur la boutique." },
          { label: "Stock initial", desc: "Quantité de départ." },
          { label: "Seuil d'alerte", desc: "Si le stock descend sous ce seuil → alerte rouge dans Stock et Achats." },
          { label: "Description", desc: "Texte long affiché sur la fiche produit de la boutique." },
          { label: "Collections", desc: "Cocher les collections dans lesquelles ce produit doit apparaître (multi-sélection possible)." },
          { label: "Tags", desc: "Mots-clés pour la recherche et le filtrage boutique." },
          { label: "World (coiffure / onglerie)", desc: "Détermine dans quel univers le produit apparaît sur la boutique." },
          { label: "is_new (badge AWAKHIR)", desc: "Cocher pour afficher le badge 'AWAKHIR' (Nouveau) sur la boutique." },
        ],
      },
      {
        id: "cat-photo",
        title: "Upload de Photo Produit",
        icon: "📸",
        content: "Chaque variante peut avoir une photo. Les images sont stockées dans Supabase Storage (bucket product-images).",
        details: [
          { label: "Bouton 'Uploader une photo'", desc: "Ouvre le sélecteur de fichier. Formats acceptés : JPG, PNG, WebP. Taille recommandée : 800×800px minimum." },
          { label: "Aperçu immédiat", desc: "La photo s'affiche immédiatement après upload — pas besoin de sauvegarder séparément." },
          { label: "Remplacement", desc: "Uploader une nouvelle photo remplace l'ancienne automatiquement." },
          { label: "Zoom lightbox (Stock)", desc: "Sur la page Stock, cliquer sur la miniature ouvre un lightbox plein écran avec la photo en haute résolution." },
        ],
      },
      {
        id: "cat-archiver",
        title: "Archiver et Supprimer",
        icon: "🗑️",
        content: "Deux actions disponibles pour retirer un produit du catalogue.",
        details: [
          { label: "Archiver (désactiver)", desc: "Le produit disparaît de la boutique mais reste dans la base. Les statistiques historiques sont conservées. RECOMMANDÉ pour les produits temporairement en rupture." },
          { label: "Supprimer définitivement (owner)", desc: "Supprime le produit de nc_variants pour toujours. Réservé au owner. À utiliser uniquement si le produit n'a jamais été vendu." },
          { label: "Logique archived", desc: "Un produit avec status='archived' ne peut pas être commandé depuis la boutique, même si son stock est > 0." },
        ],
      },
    ],
  },

  // ─────────────────── COLLECTIONS ───────────────────────────────
  {
    id: "collections",
    icon: "🗂️",
    title: "Collections",
    color: "teal",
    desc: "Gestion des collections produits. Une collection regroupe des produits thématiques (ex: Toppik, Coiffure Pro, Nail Art).",
    subsections: [
      {
        id: "col-principe",
        title: "Principe des Collections",
        icon: "📖",
        content: "Les collections s'affichent sur la boutique comme des catégories navigables. Un produit peut appartenir à plusieurs collections simultanément.",
        details: [
          { label: "Collection 'Coiffure'", desc: "Regroupe tous les produits du monde coiffure." },
          { label: "Collection 'Onglerie'", desc: "Regroupe tous les produits du monde onglerie." },
          { label: "Collections spécialisées", desc: "Ex: Toppik, Nail Art, Coiffure Pro — permettent une navigation fine sur la boutique." },
          { label: "collections_titles (colonne)", desc: "Dans nc_variants, liste les noms des collections d'un produit. C'est ce champ qui est lu par la boutique." },
        ],
      },
      {
        id: "col-gestion",
        title: "Gérer les Collections",
        icon: "✏️",
        content: "Depuis la page Collections, tu peux créer de nouvelles collections, les modifier, ou ajouter/retirer des produits.",
        details: [
          { label: "Créer une collection", desc: "Bouton '+ Nouvelle collection'. Saisir le nom, le monde (coiffure/onglerie), et optionnellement une image de couverture." },
          { label: "Ajouter des produits", desc: "Ouvrir la collection → 'Ajouter des produits' → cocher les variantes à inclure. Les produits apparaîtront sur la boutique dans cette collection." },
          { label: "Retirer un produit", desc: "Décocher le produit dans la liste. Il reste dans d'autres collections s'il y était." },
          { label: "Ordre d'affichage", desc: "Les collections sont affichées sur la boutique dans l'ordre de leur position. Modifiable par glisser-déposer." },
        ],
      },
    ],
  },

  // ─────────────────── POS ───────────────────────────────────────
  {
    id: "pos",
    icon: "🖥️",
    title: "POS Comptoir (Point de Vente)",
    color: "violet",
    desc: "Caisse enregistreuse numérique pour les ventes en présentiel. Interface mobile-first avec grille produits, panier, et code-barres.",
    subsections: [
      {
        id: "pos-grille",
        title: "Grille Produits (Tiles)",
        icon: "🔲",
        content: "L'interface principale est une grille de tuiles (tiles) — chaque tuile = un produit.",
        mockup: {
          type: "pos-tiles",
        },
        details: [
          { label: "Photo + nom + prix", desc: "Chaque tuile affiche la photo du produit, son nom, et son prix de vente." },
          { label: "Badge rouge 'RUPTURE'", desc: "Si le stock est 0 → badge rouge 'RUPTURE' sur la tuile. Le produit est grísé et ne peut pas être ajouté au panier." },
          { label: "Appui sur une tuile", desc: "Ajoute le produit au panier avec quantité 1. Appuis répétés = augmente la quantité." },
          { label: "Grille vide au départ", desc: "La grille est vide jusqu'à ce que tu effectues une recherche ou utilises le scanner. Design intentionnel pour éviter les erreurs." },
        ],
      },
      {
        id: "pos-recherche",
        title: "Recherche et Scanner Code-barres",
        icon: "🔍",
        content: "Deux façons de trouver un produit : tapez son nom dans la barre de recherche, ou scannez son code-barres avec la caméra.",
        details: [
          { label: "Barre de recherche", desc: "Tapez n'importe quel fragment du nom, SKU, ou code-barres. Les tuiles se filtrent en temps réel." },
          { label: "Bouton 📷 Scanner caméra", desc: "Ouvre le scanner caméra. Pointez l'appareil vers le code-barres — il est détecté automatiquement. Vibration + prévisualisation du produit avant confirmation." },
          { label: "BarcodeDetector API", desc: "Sur Android Chrome / Edge : détection native ultra-rapide. Sur autres navigateurs : fallback via @zxing/browser." },
          { label: "Produit non trouvé", desc: "Si le code scanné ne correspond à aucun produit → message 'Code inconnu'. Vérifie dans le Catalogue si le barcode est bien enregistré." },
        ],
      },
      {
        id: "pos-panier",
        title: "Panier et Bottom Sheet",
        icon: "🛒",
        content: "Le panier est affiché dans une bottom sheet (panneau qui glisse depuis le bas sur mobile). Un bouton flottant en bas à droite montre le nombre d'articles et le total.",
        details: [
          { label: "Bouton flottant 🛒", desc: "Apparaît dès qu'il y a un article dans le panier. Affiche le total en DA. Tap = ouvre le panier." },
          { label: "Bottom sheet panier", desc: "Liste tous les articles avec leurs quantités. Tu peux augmenter/diminuer les quantités ou supprimer un article (croix rouge)." },
          { label: "Total TTC", desc: "Calculé automatiquement à chaque modification du panier." },
          { label: "Infos client (optionnel)", desc: "Nom du client, téléphone — optionnel pour les ventes en présentiel rapides." },
          { label: "Bouton 'Finaliser la vente'", desc: "Crée la commande dans nc_orders avec order_source='pos'. Déduit le stock dans nc_variants. La commande apparaît dans Confirmation onglet POS." },
          { label: "Bouton Imprimer", desc: "Génère un ticket de caisse imprimable pour la vente." },
        ],
      },
    ],
  },

  // ─────────────────── ACHATS ────────────────────────────────────
  {
    id: "achats",
    icon: "🛒",
    title: "Achats (KPI Stock)",
    color: "orange",
    desc: "Tableau de bord des achats. Identifie les produits à commander en urgence et ceux qui dorment en stock.",
    subsections: [
      {
        id: "ach-urgence",
        title: "Onglet 'À Acheter' — Niveaux d'Urgence",
        icon: "🚨",
        content: "Liste les produits classés par niveau d'urgence en fonction du stock restant et de la vitesse de vente.",
        mockup: {
          type: "urgency-levels",
          levels: [
            { color: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500", label: "🔴 CRITIQUE", desc: "< 3 jours de stock restant. Commander immédiatement." },
            { color: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500", label: "🟠 URGENT", desc: "3 à 7 jours de stock. Commander dans les 2 jours." },
            { color: "bg-yellow-100 text-yellow-800 border-yellow-200", dot: "bg-yellow-500", label: "🟡 MOYEN", desc: "7 à 14 jours de stock. Prévoir la commande." },
            { color: "bg-green-100 text-green-800 border-green-200", dot: "bg-green-500", label: "🟢 FAIBLE", desc: "14+ jours de stock. Surveiller." },
          ],
        },
        details: [
          { label: "Stock restant", desc: "Quantité actuelle dans nc_variants." },
          { label: "Vitesse de vente (unités/jour)", desc: "Calculée sur les 30 derniers jours. Ex: 2.5 unités/jour." },
          { label: "Jours avant rupture", desc: "Stock ÷ Vitesse. Ex: 10 ÷ 2.5 = 4 jours. Apparaît en rouge si < 7 jours." },
          { label: "Bouton 'Commandé'", desc: "Coche quand la commande fournisseur a été passée. Retire le produit de la liste pour cette journée." },
        ],
      },
      {
        id: "ach-nonvendus",
        title: "Onglet 'Dispo Non Vendu'",
        icon: "💤",
        content: "Produits en stock depuis plus de 60 jours SANS aucune vente. Représentent du capital immobilisé.",
        details: [
          { label: "Qu'est-ce que ça signifie ?", desc: "Un produit acheté mais jamais vendu en 60 jours = soit mauvais produit, soit mal mis en avant. Cash bloqué." },
          { label: "Actions recommandées", desc: "1) Promotions (réduction prix, code coupon) — 2) Mise en avant boutique (badge AWAKHIR) — 3) Liquidation — 4) Retour fournisseur si possible." },
          { label: "Comment signaler ?", desc: "Créer un rapport (page Rapport) avec catégorie 'Stock non vendu' pour informer le responsable et définir une stratégie." },
        ],
      },
    ],
  },

  // ─────────────────── FINANCE ───────────────────────────────────
  {
    id: "finance",
    icon: "💰",
    title: "Finance (Fond de Caisse)",
    color: "emerald",
    desc: "Gestion du fond de caisse : entrées, sorties, solde, recettes des livreurs. Toutes les transactions sont tracées.",
    subsections: [
      {
        id: "fin-fond",
        title: "Onglet Fond de Caisse",
        icon: "💵",
        content: "Affiche le solde en temps réel et toutes les transactions du fond.",
        details: [
          { label: "Solde total (en haut)", desc: "TOTAL ENTRÉES − TOTAL SORTIES = Solde actuel. Mis à jour à chaque transaction." },
          { label: "Compteurs Entrées / Sorties", desc: "Deux cartes colorées montrant le total des flux dans chaque sens pour la période." },
          { label: "Liste des transactions", desc: "Toutes les transactions dans l'ordre chronologique inverse (plus récente en haut)." },
          { label: "Date + heure", desc: "Horodatage précis de chaque transaction. Impossible à modifier après enregistrement." },
          { label: "Catégorie", desc: "Ex: Paiement fournisseur, Dépense opérationnelle, Retrait caisse, Déposer une recette." },
          { label: "Montant", desc: "En DA. Entrée = vert. Sortie = rouge." },
          { label: "Description", desc: "Note libre saisie par l'agent. Ex: 'Achat carton emballage 200u'." },
          { label: "Auteur", desc: "Nom de l'agent qui a enregistré la transaction." },
        ],
      },
      {
        id: "fin-transaction",
        title: "Ajouter une Transaction",
        icon: "➕",
        content: "Bouton '+ Transaction' → ouvre un formulaire.",
        details: [
          { label: "Type : ENTRÉE ou SORTIE", desc: "ENTRÉE = argent reçu. SORTIE = argent dépensé." },
          { label: "Catégorie", desc: "Obligatoire. Choisir dans la liste. Sert pour les rapports financiers." },
          { label: "Montant (DA)", desc: "Saisir le montant exact sans virgule (ex: 5000)." },
          { label: "Description", desc: "Obligatoire. Être précis : qui, quoi, pourquoi." },
          { label: "Fournisseur / Référence (optionnel)", desc: "Nom du fournisseur ou numéro de facture — utile pour la comptabilité." },
        ],
      },
      {
        id: "fin-recette",
        title: "Onglet Recettes",
        icon: "🧾",
        content: "Enregistrement des dépôts de cash des agents de livraison. Séparé du fond de caisse général.",
        details: [
          { label: "Dépôt de recette", desc: "L'agent livreur rapporte le cash des commandes livrées. Créer une transaction catégorie 'Déposer une recette' avec : montant + IDs commandes (première et dernière du lot)." },
          { label: "Calcul automatique des écarts", desc: "Le système compare le montant déclaré avec la somme des commandes livrées dans la période. Un écart positif ou négatif est signalé." },
          { label: "Historique", desc: "Tous les dépôts sont archivés avec date, montant, et agent." },
        ],
      },
      {
        id: "fin-reset",
        title: "Réinitialisation du Fond (Owner uniquement)",
        icon: "🔄",
        content: "Le bouton 'Réinitialiser' (visible uniquement pour le owner) remet le solde à zéro pour commencer une nouvelle période.",
        details: [
          { label: "Effet", desc: "Le solde repart de 0. L'historique complet est archivé et consultable." },
          { label: "Réservé au owner", desc: "Aucun agent ne peut réinitialiser. Contacter le responsable." },
          { label: "Supprimer une transaction", desc: "Également réservé au owner. En cas d'erreur de saisie : contacter le responsable." },
        ],
      },
    ],
  },

  // ─────────────────── RAPPORT ───────────────────────────────────
  {
    id: "rapport",
    icon: "📊",
    title: "Rapport",
    color: "rose",
    desc: "Système de signalement d'anomalies et de communication interne. Chaque problème est tracé, assigné, et résolu.",
    subsections: [
      {
        id: "rapp-creer",
        title: "Créer un Rapport",
        icon: "✍️",
        content: "Bouton '+ Nouveau rapport' → formulaire de signalement.",
        details: [
          { label: "Catégorie", desc: "Obligatoire. Exemples : Problème commande · Problème stock · Problème préparation · Problème client · Problème technique · Stock non vendu · Autre." },
          { label: "Cas précis", desc: "Sous-catégorie du problème. Dépend de la catégorie choisie." },
          { label: "Description", desc: "Décris le problème clairement et précisément. Qui, quoi, quand, numéro de commande si applicable." },
          { label: "Numéro de commande (optionnel)", desc: "Lie le rapport à une commande spécifique pour un suivi facile." },
          { label: "Priorité", desc: "Normal / Urgent / Critique. Influence l'ordre d'affichage pour les managers." },
          { label: "Bouton 'Envoyer'", desc: "Enregistre le rapport dans nc_rapports. Le manager reçoit une notification immédiate." },
        ],
      },
      {
        id: "rapp-liste",
        title: "Liste de tes Rapports",
        icon: "📋",
        content: "Tu peux voir tous les rapports que tu as créés, avec leur statut de traitement.",
        details: [
          { label: "En attente", desc: "Le manager n'a pas encore traité le rapport." },
          { label: "En cours", desc: "Le manager a vu le rapport et travaille dessus." },
          { label: "Vérifié / Résolu", desc: "Le problème est réglé. Une note du manager peut être visible." },
          { label: "Note manager", desc: "Réponse écrite du manager ou du DRH — explique ce qui a été fait." },
        ],
      },
      {
        id: "rapp-badge",
        title: "Badge rouge sur Rapport",
        icon: "🔴",
        content: "Un chiffre rouge sur le lien 'Rapport' dans la sidebar = nouveaux rapports depuis ta dernière visite.",
        details: [
          { label: "Pour les agents", desc: "Indique que le manager a ajouté une note sur un de tes rapports." },
          { label: "Pour les managers", desc: "Indique de nouveaux rapports non lus soumis par les agents." },
          { label: "Disparaît automatiquement", desc: "Le badge se réinitialise dès que tu ouvres la page Rapport." },
        ],
      },
    ],
  },

  // ─────────────────── DISCUSSIONS ───────────────────────────────
  {
    id: "discussions",
    icon: "💬",
    title: "Discussions",
    color: "cyan",
    desc: "Chat interne en temps réel entre tous les membres de l'équipe. Messages, réactions emoji, salons thématiques.",
    subsections: [
      {
        id: "disc-chat",
        title: "Interface de Chat",
        icon: "💬",
        content: "Interface de messagerie simple et rapide. Les messages s'affichent en temps réel sans rafraîchir la page.",
        details: [
          { label: "Bulles de messages", desc: "Tes messages → à droite (couleur). Messages des autres → à gauche (gris)." },
          { label: "Nom de l'auteur + heure", desc: "Affiché sous chaque message." },
          { label: "Temps réel", desc: "Powered by Supabase Realtime — les messages arrivent en moins d'une seconde sans rechargement." },
          { label: "Champ de saisie", desc: "En bas de page. Appui sur Entrée ou bouton Envoyer pour envoyer." },
          { label: "@mention", desc: "Tape @nom pour mentionner un collègue. Il recevra une notification push dédiée." },
          { label: "Messages vocaux", desc: "Bouton micro 🎤 — maintenir appuyé pour enregistrer un message vocal." },
          { label: "Images & vidéos", desc: "Bouton 📎 pour envoyer des fichiers image/vidéo directement dans le chat." },
        ],
      },
      {
        id: "disc-reactions",
        title: "Réactions Emoji sur les Messages",
        icon: "❤️",
        content: "Chaque message peut recevoir 4 types de réactions. Survole une réaction pour voir qui a réagi.",
        details: [
          { label: "❤️ Bien reçu", desc: "Message lu et compris. Utilise cette réaction pour confirmer que tu as bien vu l'information." },
          { label: "🔥 Effectué / Terminé", desc: "La tâche demandée dans ce message a été accomplie." },
          { label: "❌ Problème / Faute", desc: "Il y a une erreur ou un problème dans ce message." },
          { label: "⛔ Important", desc: "Ce message est prioritaire / à ne pas manquer." },
          { label: "Toggle", desc: "Cliquer une réaction que tu as déjà mise = la retirer." },
          { label: "Compteur", desc: "Un chiffre s'affiche à côté de l'emoji si plusieurs personnes ont réagi (ex: ❤️ 3)." },
          { label: "Popover noms", desc: "Survole une réaction → un popover s'ouvre avec les noms de tous ceux qui ont réagi. Ton nom apparaît en jaune avec ✓ Vous." },
        ],
      },
      {
        id: "disc-salons",
        title: "Salons Thématiques",
        icon: "🏷️",
        content: "Les discussions sont organisées en salons. Chaque salon a un sujet dédié.",
        details: [
          { label: "Salon Général", desc: "Discussions générales de l'équipe — annonces, questions, informations courantes." },
          { label: "Salon Créatif", desc: "Partage de vidéos et images pour les réseaux sociaux. Le owner peut ajouter un contenu à la File d'attente réseaux sociaux directement depuis ce salon." },
          { label: "Changer de salon", desc: "Utilise les onglets en haut de la page Discussions pour passer d'un salon à l'autre." },
        ],
      },
      {
        id: "disc-badge",
        title: "Badge rouge sur Discussions",
        icon: "🔴",
        content: "Nombre de messages non lus depuis ta dernière visite sur la page Discussions.",
        details: [
          { label: "Comptage automatique", desc: "Compte les messages des autres (pas les tiens) postés après ta dernière visite." },
          { label: "Mise à jour en temps réel", desc: "Si tu es sur une autre page et qu'un message arrive → le badge s'incrémente instantanément." },
          { label: "Réinitialisation", desc: "Disparaît dès que tu ouvres la page Discussions." },
        ],
      },
    ],
  },

  // ─────────────────── NOTIFICATIONS ─────────────────────────────
  {
    id: "notifications",
    icon: "🔔",
    title: "Notifications",
    color: "amber",
    desc: "Centre de notifications du dashboard. Toutes les alertes importantes en un seul endroit.",
    subsections: [
      {
        id: "notif-cloche",
        title: "Cloche de Notifications (topbar)",
        icon: "🔔",
        content: "L'icône cloche en haut à droite. Un point rouge = notifications non lues.",
        details: [
          { label: "Cliquer sur la cloche", desc: "Ouvre un panneau dropdown avec les 50 dernières notifications." },
          { label: "Types de notifications", desc: "💬 Mention (quelqu'un t'a @mentionné) · 📊 Rapport (réponse manager) · 📌 Note · 📸 Shooting · 📦 Retour colis · 🔔 Général." },
          { label: "Heure relative", desc: "'à l'instant' / 'il y a X min' / 'il y a Xh' / date complète si > 24h." },
          { label: "Lien 'Voir ›'", desc: "Certaines notifications ont un lien direct vers la page concernée. Clique pour aller directement." },
          { label: "Marquer comme lues", desc: "Automatique dès que tu ouvres le panneau." },
        ],
      },
      {
        id: "notif-push",
        title: "Notifications Push (hors dashboard)",
        icon: "📱",
        content: "Si tu as activé les notifications push, tu reçois des alertes sur ton téléphone même quand le dashboard est fermé.",
        details: [
          { label: "Comment activer", desc: "Clique sur 'Activer' dans la bannière jaune qui apparaît en haut, ou via les paramètres de ton navigateur." },
          { label: "Ce que tu reçois", desc: "Nouvelles commandes urgentes, rapports marqués 'critique', messages de mention @ton_nom." },
          { label: "Clique sur la notification", desc: "S'ouvre directement sur la bonne page du dashboard." },
        ],
      },
    ],
  },

  // ─────────────────── ORGANISATION ──────────────────────────────
  {
    id: "organisation",
    icon: "🗂️",
    title: "Organisation",
    color: "sky",
    desc: "Notes partagées, réactions emoji, tâches cochables et agenda. Espace central de coordination de l'équipe.",
    subsections: [
      {
        id: "org-notes",
        title: "Notes et Tableaux",
        icon: "📌",
        content: "La page est divisée en deux tableaux : Public (tous peuvent voir) et Privé (toi seul). Sur desktop les notes sont des sticky notes déplaçables. Sur mobile elles s'affichent en liste.",
        details: [
          { label: "Tableau Public", desc: "Visible par toute l'équipe. Idéal pour les tâches du jour, consignes, annonces importantes." },
          { label: "Tableau Privé", desc: "Visible uniquement par toi. Notes personnelles, to-do lists, mémos." },
          { label: "Créer une note", desc: "Bouton '+ Note' → saisir le contenu → choisir la couleur → cliquer 'Créer'." },
          { label: "Déplacer une note (desktop)", desc: "Glisser-déposer la sticky note pour la repositionner sur le tableau." },
          { label: "Assigner à plusieurs personnes", desc: "Dans le modal de création/édition → section 'Assigner à' → cocher plusieurs noms. Les destinataires reçoivent une notification push." },
          { label: "Couleur de la note", desc: "8 couleurs disponibles. Utilise-les pour organiser par type : jaune = général, rouge = urgent, vert = ok, bleu = info…" },
          { label: "Note surlignée en violet (indigo)", desc: "Une note avec un contour indigo = elle t'est assignée personnellement." },
        ],
      },
      {
        id: "org-edit",
        title: "Modifier une Note",
        icon: "✏️",
        content: "Tu peux modifier le contenu, la couleur et les destinataires d'une note que tu as créée.",
        details: [
          { label: "Bouton ✎ (desktop)", desc: "Survole la note → le bouton ✎ apparaît en haut à droite → cliquer pour ouvrir le modal d'édition." },
          { label: "Bouton ✎ (mobile)", desc: "Toujours visible à droite de chaque note dans la liste." },
          { label: "Permissions", desc: "Tu peux modifier uniquement tes propres notes. Les managers (responsable, owner) peuvent modifier toutes les notes." },
          { label: "Champs modifiables", desc: "Contenu du texte · Couleur · Destinataire(s) assigné(s)." },
        ],
      },
      {
        id: "org-reactions",
        title: "Réactions Emoji sur les Notes",
        icon: "❤️",
        content: "Chaque note peut recevoir 4 réactions emoji. Clique pour réagir, survole pour voir qui a réagi.",
        details: [
          { label: "❤️ Bien reçu", desc: "J'ai vu cette note et je confirme l'avoir lue." },
          { label: "🔥 Effectué / Terminé", desc: "La tâche indiquée dans cette note est accomplie." },
          { label: "❌ Problème / Faute", desc: "Il y a un problème avec le contenu de cette note." },
          { label: "⛔ Important", desc: "Cette note est prioritaire / à ne surtout pas manquer." },
          { label: "Toggle", desc: "Cliquer une réaction déjà posée la retire." },
          { label: "Popover survol", desc: "Survole une réaction → liste des noms de tous ceux qui ont réagi." },
          { label: "Temps réel", desc: "Les réactions se mettent à jour instantanément sans recharger la page." },
        ],
      },
      {
        id: "org-tasks",
        title: "Tâches Cochables dans une Note",
        icon: "☑️",
        content: "Dans une note, tu peux créer des tâches individuelles que tu peux cocher une fois accomplies.",
        details: [
          { label: "Ajouter une tâche", desc: "Dans le modal d'édition → section 'Tâches' → cliquer '+ Ajouter une tâche' → saisir le texte." },
          { label: "Cocher une tâche", desc: "Cliquer sur la case ☐ devant une tâche pour la marquer comme faite ✅." },
          { label: "Permissions", desc: "Seul l'auteur de la note et le owner peuvent cocher/décocher les tâches." },
          { label: "État partagé", desc: "Tout le monde voit quelles tâches sont cochées. Si tu coches une tâche, tous les autres agents le voient immédiatement." },
          { label: "Exemple d'usage", desc: "Note 'Préparation shooting' avec tâches : ☑ Préparer les articles · ☐ Arranger l'éclairage · ☐ Envoyer les photos." },
        ],
      },
      {
        id: "org-agenda",
        title: "Agenda (vue Manager/Owner)",
        icon: "📅",
        content: "Calendrier des événements d'équipe. Visible uniquement pour les responsables et le owner.",
        details: [
          { label: "Accès", desc: "Onglet 'Agenda' en haut de la page Organisation. Visible uniquement si tu as le rôle responsable ou owner." },
          { label: "Créer un événement", desc: "Cliquer sur une date du calendrier → remplir titre, couleur, récurrence." },
          { label: "Récurrence", desc: "Événement unique · Routine hebdomadaire · Mensuel · Dates précises à la main." },
          { label: "Marquer terminé", desc: "Cliquer sur l'événement → bouton ✓ pour marquer comme terminé." },
        ],
      },
    ],
  },

  // ─────────────────── CRÉATIF & RÉSEAUX SOCIAUX ──────────────────
  {
    id: "social",
    icon: "🎬",
    title: "Créatif & Réseaux Sociaux",
    color: "purple",
    desc: "Salon Créatif pour brainstormer le contenu, et File d'attente pour planifier et suivre les publications TikTok / Instagram / Facebook.",
    subsections: [
      {
        id: "social-salon",
        title: "Salon Créatif (Discussions)",
        icon: "💡",
        content: "Le salon 'Créatif' dans les Discussions est l'espace de brainstorming de l'équipe pour les idées de contenu réseaux sociaux.",
        details: [
          { label: "À quoi ça sert", desc: "Partager des idées de vidéos, des inspirations, des références visuelles. Discussion libre sans contrainte." },
          { label: "Ajouter à la file d'attente", desc: "Le owner clique sur '+ File' sur un message → un modal s'ouvre pour configurer le contenu avant de l'ajouter à la file." },
          { label: "Rôles", desc: "Tout le monde peut discuter dans ce salon. Seul le owner peut ajouter du contenu à la file d'attente." },
        ],
      },
      {
        id: "social-queue",
        title: "File d'Attente — Publications Planifiées",
        icon: "📋",
        content: "La page 'Créatif' (accessible depuis la sidebar) liste tout le contenu validé en attente de publication sur les réseaux sociaux.",
        details: [
          { label: "Ajouter un contenu", desc: "Via le bouton '+ File' dans le salon Créatif. Remplir : titre, type (Reels ou Story), univers (Coiffure ou Onglerie), plateformes, date prévue." },
          { label: "Types", desc: "Reels = vidéo courte format vertical (15s-90s). Story = contenu éphémère 24h." },
          { label: "Plateformes", desc: "TikTok · Instagram · Facebook. Tu peux cocher plusieurs plateformes pour un même contenu." },
          { label: "Réorganiser", desc: "Glisser-déposer les éléments pour changer l'ordre de publication." },
          { label: "Marquer comme partagé", desc: "Une fois le contenu posté sur les réseaux → cliquer ✅ 'Marquer comme partagé'. Ton nom et la date sont enregistrés." },
          { label: "Note automatique", desc: "Quand tu marques un contenu comme partagé → une note verte est automatiquement créée dans la page Organisation et tous les agents digitaux sont notifiés." },
        ],
      },
      {
        id: "social-counters",
        title: "Compteurs Objectifs Mensuels",
        icon: "📊",
        content: "En haut de la page File d'attente, des barres de progression affichent l'avancement vers les objectifs du mois.",
        details: [
          { label: "🎬 Coiffure Reels", desc: "Objectif : 15 Reels Coiffure par mois. La barre passe au vert quand l'objectif est atteint." },
          { label: "💅 Onglerie Reels", desc: "Objectif : 15 Reels Onglerie par mois." },
          { label: "Stories", desc: "Affichées et comptabilisées mais sans objectif mensuel défini." },
          { label: "Calcul", desc: "Seuls les contenus 'partagé' du mois en cours sont comptés dans les barres de progression." },
        ],
      },
    ],
  },

  // ─────────────────── OPÉRATIONS ────────────────────────────────
  {
    id: "operations",
    icon: "⚡",
    title: "Opérations",
    color: "indigo",
    desc: "Actions sensibles de fin de journée : clôture, injections en masse, et opérations d'administration avancées.",
    subsections: [
      {
        id: "ops-cloture",
        title: "Clôture de Journée",
        icon: "🔒",
        content: "Action de fin de journée qui finalise toutes les commandes en cours et remet les stocks des annulations.",
        details: [
          { label: "Quand faire la clôture ?", desc: "En fin de journée de travail, après que tous les agents ont terminé leurs confirmations." },
          { label: "Ce que ça fait", desc: "1) Marque les commandes du jour comme 'last=OUI' (clôturées). 2) Remet en stock les articles des commandes annulées dans la journée." },
          { label: "Irréversible", desc: "La clôture ne peut pas être annulée. Les commandes passées en 'last=OUI' portent l'icône 🗓️ le lendemain." },
          { label: "Accès", desc: "Responsables et owner uniquement." },
        ],
      },
      {
        id: "ops-inject",
        title: "Injection en Masse (Batch)",
        icon: "⬆️",
        content: "Permet d'envoyer plusieurs commandes d'un coup à ZR Express, au lieu de les injecter une par une.",
        details: [
          { label: "Sélectionner les commandes", desc: "Cocher les commandes confirmées et préparées à envoyer." },
          { label: "Bouton 'Injecter le lot'", desc: "Envoie toutes les commandes sélectionnées à ZR Express en une seule opération. Génère un tracking pour chacune." },
          { label: "Rapport d'injection", desc: "Après l'injection, un rapport résumé s'affiche : X réussies, Y échouées (avec les raisons)." },
        ],
      },
    ],
  },

  // ─────────────────── BI DASHBOARD ─────────────────────────────
  {
    id: "bi",
    icon: "🏥",
    title: "Tableau de Bord BI (Owner)",
    color: "emerald",
    desc: "Tableau de bord opérationnel quotidien du propriétaire. Score de santé business, bénéfice, livraison, WhatsApp marketing, et évolution J-1.",
    subsections: [
      {
        id: "bi-acces",
        title: "Accès et Rafraîchissement",
        icon: "🔗",
        content: "Accessible depuis le menu Owner → '🏥 BI'. URL directe : /dashboard/owner/bi. La page se rafraîchit automatiquement toutes les 5 minutes. Tu peux aussi choisir une date passée avec le sélecteur de date.",
        details: [
          { label: "Sélecteur de date", desc: "En haut à droite — tu peux consulter n'importe quel jour passé. Par défaut = aujourd'hui." },
          { label: "Bouton ↺ Rafraîchir", desc: "Force un rechargement immédiat des KPIs depuis Supabase." },
          { label: "📲 Rapport WhatsApp", desc: "Bouton qui envoie un résumé complet au numéro WATI configuré. Format prêt à lire." },
          { label: "⚙️ Objectifs", desc: "Panneau de configuration : objectif bénéfice mensuel, objectif commandes/jour, dette fournisseur initiale." },
        ],
      },
      {
        id: "bi-sante",
        title: "Score de Santé Business (0-100)",
        icon: "💯",
        content: "Le score arc en haut de la page résume en un chiffre l'état global du business ce jour-là. Pondéré sur 5 facteurs.",
        mockup: {
          type: "badges",
          badges: [
            { label: "🟢 85-100 — Excellente santé", color: "bg-emerald-100 text-emerald-700", desc: "Tout va bien — confirmation élevée, livraison ok, bénéfice atteint." },
            { label: "🟡 70-84 — À surveiller", color: "bg-yellow-100 text-yellow-700", desc: "Quelques indicateurs à améliorer." },
            { label: "🟠 50-69 — Attention requise", color: "bg-orange-100 text-orange-700", desc: "Plusieurs indicateurs dégradés — agir rapidement." },
            { label: "🔴 0-49 — Action immédiate", color: "bg-red-100 text-red-700", desc: "Business en difficulté — interventions urgentes nécessaires." },
          ],
        },
        details: [
          { label: "Facteur 1 — Taux confirmation", desc: "< 50% retire 30 pts. Entre 50-65% retire 15 pts. Entre 65-75% retire 5 pts. Au-dessus de 75% = OK." },
          { label: "Facteur 2 — Taux livraison 30j", desc: "< 60% retire 25 pts. L'objectif est > 80%." },
          { label: "Facteur 3 — Bénéfice vs objectif jour", desc: "Si le bénéfice du jour est < 50% de l'objectif journalier estimé → retire 20 pts." },
          { label: "Facteur 4 — Ruptures stock", desc: "> 20% des produits en rupture retire 15 pts." },
          { label: "Facteur 5 — Écart caisse", desc: "Si l'écart entre recettes déclarées et attendues dépasse 500 DA → retire 5 pts." },
        ],
      },
      {
        id: "bi-benefice",
        title: "Section Bénéfice (KPI Central)",
        icon: "💎",
        content: "Le bénéfice brut = Prix de vente − Prix d'achat fournisseur. C'est l'indicateur principal, pas le CA.",
        details: [
          { label: "Bénéfice total du jour", desc: "Boutique en ligne + POS. Affiché en vert si l'objectif journalier est atteint, en jaune si proche, en rouge sinon." },
          { label: "Objectif journalier estimé", desc: "Objectif mensuel ÷ 30. Affiché en sous-titre." },
          { label: "Barre de progression mensuelle", desc: "% de l'objectif mensuel atteint à date. Mis à jour en temps réel." },
          { label: "Taux de marge", desc: "Affiché en % sur chaque carte (boutique + POS)." },
        ],
      },
      {
        id: "bi-j1",
        title: "Évolution vs Hier (J-1)",
        icon: "📈",
        content: "Section qui compare les chiffres d'aujourd'hui avec ceux d'hier. Chaque KPI affiche un delta ▲ (hausse) ou ▼ (baisse).",
        details: [
          { label: "▲ Vert = hausse", desc: "Les chiffres d'aujourd'hui sont supérieurs à hier." },
          { label: "▼ Rouge = baisse", desc: "Les chiffres d'aujourd'hui sont inférieurs à hier." },
          { label: "▬ Stable", desc: "Aucun changement vs hier." },
          { label: "4 métriques suivies", desc: "Récoltées · Confirmées · CA total · Bénéfice. Idéal pour détecter les tendances en un coup d'œil." },
        ],
      },
      {
        id: "bi-whatsapp",
        title: "WhatsApp Marketing (section campagnes)",
        icon: "📲",
        content: "Affiche les performances des campagnes WhatsApp du jour — messages envoyés, lus, convertis en commandes, revenus attribués.",
        details: [
          { label: "Messages envoyés", desc: "Nombre total de messages WhatsApp partis dans la journée (toutes campagnes confondues)." },
          { label: "Taux de lecture", desc: "% de messages qui ont été lus. Objectif : > 70% (WhatsApp a naturellement un très haut taux de lecture)." },
          { label: "Convertis", desc: "Nombre de destinataires qui ont passé une commande dans les 72h suivant la réception du message." },
          { label: "Revenus attribués", desc: "CA total des commandes issues de conversions WhatsApp. Permet de calculer le ROI des campagnes." },
          { label: "Aucun message envoyé", desc: "Si aucune campagne n'a tourné ce jour-là, un message informatif le signale." },
        ],
      },
    ],
  },

  // ─────────────────── CAMPAGNES WHATSAPP ────────────────────────
  {
    id: "campagnes",
    icon: "📱",
    title: "Campagnes WhatsApp (Owner)",
    color: "cyan",
    desc: "Système complet de gestion des campagnes marketing WhatsApp. Créer des campagnes, tester des templates, A/B tester, et analyser les performances.",
    subsections: [
      {
        id: "camp-acces",
        title: "Accès à la Page Campagnes",
        icon: "🔗",
        content: "Accessible depuis le menu Owner → '📱 Campagnes'. URL : /dashboard/owner/campaigns. La page contient 3 onglets : Campagnes, Template Lab, Analytics.",
        details: [
          { label: "Onglet Campagnes", desc: "Liste et gestion de toutes les campagnes créées." },
          { label: "Onglet Template Lab", desc: "Proposer de nouveaux templates, les tester, voir leurs performances." },
          { label: "Onglet Analytics", desc: "Vue globale des KPIs marketing — classement des templates par taux de conversion, revenus totaux attribués." },
        ],
      },
      {
        id: "camp-templates",
        title: "Templates WhatsApp — Règles importantes",
        icon: "📄",
        content: "Un template est un message pré-approuvé par Meta pour l'envoi en masse via WhatsApp Business. Chaque template doit être approuvé avant utilisation.",
        details: [
          { label: "Approbation Meta (24-48h)", desc: "Tout nouveau template est soumis à Meta pour validation. Statut PENDING → APPROVED (approuvé) ou REJECTED (refusé). Tu ne peux envoyer que des templates APPROVED." },
          { label: "Paramètres variables {{1}}", desc: "Les templates contiennent des variables. Ex: 'سلام {{1}}' où {{1}} = prénom du client. Ces variables sont remplies automatiquement par le système." },
          { label: "6 templates actifs NajmCoiff", desc: "Suivi commande, feedback livraison, nouveautés coiffure, réactivation, panier abandonné, VIP. Séparés coiffure/onglerie." },
          { label: "0 cross-sell coiffure/onglerie", desc: "Règle absolue : un client coiffure ne reçoit jamais de message onglerie et vice-versa." },
        ],
      },
      {
        id: "camp-creer",
        title: "Créer une Campagne",
        icon: "🚀",
        content: "Bouton '+ Nouvelle campagne' → formulaire de création. Une campagne = un template envoyé à un segment de clients.",
        details: [
          { label: "Nom de la campagne", desc: "Nom interne pour retrouver la campagne dans les analytics (ex: 'Réactivation Coiffure Avril')." },
          { label: "Template", desc: "Sélectionner parmi les templates APPROVED." },
          { label: "Monde", desc: "Coiffure OU Onglerie — détermine le segment de clients ciblés. Jamais les deux en même temps." },
          { label: "Test A/B", desc: "Option pour comparer deux templates sur 50%/50% de l'audience. Le gagnant est automatiquement identifié après 72h." },
          { label: "Envoi test d'abord", desc: "Avant tout envoi en masse → toujours tester sur +213542186574 via le bouton 'Test'. Vérifier la réception." },
        ],
      },
      {
        id: "camp-template-lab",
        title: "Template Lab — Proposer un nouveau template",
        icon: "🧪",
        content: "Le Template Lab permet de proposer de nouveaux templates à tester. Une fois créé, il passe en PENDING pour approbation Meta.",
        details: [
          { label: "Bouton '+ Proposer un template'", desc: "Ouvre un formulaire pour rédiger le texte du template, définir les paramètres variables, et choisir la catégorie." },
          { label: "Statuts possibles", desc: "PENDING → soumis pour approbation. APPROVED → utilisable en campagne. REJECTED → refusé par Meta (reformuler)." },
          { label: "Bouton 'Test' (Template Lab)", desc: "Envoie le template sur +213542186574 pour vérifier le rendu avant de l'approuver." },
          { label: "Score de performance", desc: "Après utilisation, chaque template reçoit un score basé sur son taux de conversion. Visible dans l'onglet Analytics." },
        ],
      },
      {
        id: "camp-analytics",
        title: "Analytics Campagnes",
        icon: "📊",
        content: "L'onglet Analytics donne une vue globale des performances de toutes les campagnes.",
        details: [
          { label: "Classement des templates", desc: "Templates triés par taux de conversion (commandes / messages envoyés). Permet d'identifier les meilleures formulations." },
          { label: "Revenus attribués", desc: "Total des commandes dont la source est un message WhatsApp envoyé dans les 72h précédentes." },
          { label: "Attribution 72h", desc: "Si un client qui a reçu un message passe une commande dans les 72 heures → la commande est attribuée à la campagne. Le système le fait automatiquement." },
          { label: "Taux lecture vs conversion", desc: "Deux métriques distinctes. Un message peut être lu (WhatsApp affiche les coches bleues) mais pas convertir. Le but = maximiser les deux." },
        ],
      },
    ],
  },

  // ─────────────────── ESPACE OWNER ──────────────────────────────
  {
    id: "owner",
    icon: "👑",
    title: "Espace Owner",
    color: "amber",
    desc: "Espace réservé exclusivement au propriétaire. Analytics complets, configuration boutique, gestion des utilisateurs, livraison.",
    subsections: [
      {
        id: "owner-pages",
        title: "Pages exclusives Owner",
        icon: "👑",
        content: "Le menu Owner contient plusieurs pages réservées exclusivement au propriétaire.",
        mockup: {
          type: "badges",
          badges: [
            { label: "🏥 BI", color: "bg-emerald-100 text-emerald-700", desc: "Tableau de bord santé business — bénéfice, livraison, WhatsApp, J-1." },
            { label: "📱 Campagnes", color: "bg-cyan-100 text-cyan-700", desc: "Campagnes WhatsApp — Template Lab, A/B test, analytics conversions." },
            { label: "🤖 Agents IA", color: "bg-indigo-100 text-indigo-700", desc: "Dashboard des 6 agents IA — statuts, déclenchements manuels." },
            { label: "📈 Analytics", color: "bg-blue-100 text-blue-700", desc: "Vue 360° ventes, agents, CA, commandes par période." },
            { label: "⚙️ Config boutique", color: "bg-gray-100 text-gray-700", desc: "Bannière, livraison, codes promo, partenaires." },
            { label: "🚚 Livraison", color: "bg-orange-100 text-orange-700", desc: "Prix de livraison par wilaya (58 wilayas ZR)." },
          ],
        },
        details: [
          { label: "BI (/dashboard/owner/bi)", desc: "Voir la section 🏥 Tableau de Bord BI pour le détail complet." },
          { label: "Campagnes (/dashboard/owner/campaigns)", desc: "Voir la section 📱 Campagnes WhatsApp pour le détail complet." },
          { label: "Agents IA (/dashboard/owner/ai)", desc: "Page de contrôle des 6 agents IA autonomes (Catalog Intelligence, Campaign Engine, WhatsApp, Content, Stock, Analytics). Chaque agent peut être déclenché manuellement et son statut est affiché." },
        ],
      },
      {
        id: "owner-analytics",
        title: "Analytics (Tableau de Bord Global)",
        icon: "📈",
        content: "Vue 360° de l'activité sur une période choisie : ventes, stock, recettes, performance des agents.",
        details: [
          { label: "Commandes par jour", desc: "Graphique des commandes boutique et POS par jour sur la période sélectionnée." },
          { label: "CA journalier", desc: "Chiffre d'affaires cumulé en DA." },
          { label: "Taux de confirmation", desc: "% commandes confirmées vs total. Indicateur clé de performance des agents." },
          { label: "Performances par agent", desc: "Combien de commandes chaque agent a confirmées/annulées." },
        ],
      },
      {
        id: "owner-config",
        title: "Configuration Boutique",
        icon: "⚙️",
        content: "Paramètres globaux de la boutique nc-boutique. Modifiable en temps réel.",
        details: [
          { label: "Texte d'annonce (banner)", desc: "Texte affiché dans la bannière en haut de la boutique (ex: promotions, événements)." },
          { label: "Livraison — Prix par wilaya", desc: "Tableau des 58 wilayas avec le prix de livraison ZR Express. Modifiable individuellement." },
          { label: "Livraison — Mode Bureau", desc: "Prix différent pour les clients qui récupèrent leur colis au bureau ZR." },
          { label: "Codes partenaires (coupons)", desc: "Créer/modifier/désactiver les codes promo. Format : CODE_PARTENAIRE / % de réduction / statut actif." },
        ],
      },
      {
        id: "owner-users",
        title: "Gestion des Utilisateurs",
        icon: "👤",
        content: "Page Utilisateurs — créer et gérer les comptes agents du dashboard.",
        details: [
          { label: "Créer un compte agent", desc: "Nom · email · mot de passe · rôle (agent / responsable / owner). Le compte est immédiatement actif." },
          { label: "Rôles disponibles", desc: "agent = accès limité aux pages de travail. responsable = accès élargi + clôture. owner = accès total + pages admin." },
          { label: "Désactiver un compte", desc: "L'agent ne peut plus se connecter mais son historique est conservé." },
          { label: "Changer le mot de passe", desc: "En cas d'oubli — le owner peut réinitialiser le mot de passe de n'importe quel agent." },
        ],
      },
      {
        id: "owner-base",
        title: "Base de Données (Database)",
        icon: "🗄️",
        content: "Vue directe sur les tables Supabase. Réservé au owner pour les vérifications et corrections manuelles.",
        details: [
          { label: "Tables disponibles", desc: "nc_orders · nc_variants · nc_events · nc_suivi_zr · nc_customers · nc_page_events · nc_partenaires · etc." },
          { label: "Lecture seule", desc: "La page Database est en lecture seule dans l'interface — elle affiche les données mais ne permet pas de modification directe depuis l'UI (pour éviter les erreurs)." },
          { label: "Utilité", desc: "Vérifier qu'une commande est bien enregistrée, rechercher un client par téléphone, contrôler les niveaux de stock exacts." },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
//  COMPOSANTS MOCKUPS VISUELS
// ═══════════════════════════════════════════════════════════════════

function MockupSidebar({ items }) {
  return (
    <div className="inline-block border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white text-xs" style={{ minWidth: 180 }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50">
        <div className="w-5 h-5 bg-gray-300 rounded-full" />
        <span className="font-bold text-gray-700 text-[11px]">Najm Coiff</span>
      </div>
      <div className="py-1">
        {items.slice(0, 10).map((item, i) => (
          <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 ${item.active ? "bg-gray-900 text-white" : "text-gray-600"}`}>
            <span className="text-sm">{item.icon}</span>
            <span className={`flex-1 text-[11px] ${item.active ? "font-semibold" : ""}`}>{item.label}</span>
            {item.badge && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.active ? "bg-white text-gray-900" : "bg-red-500 text-white"}`}>
                {item.badge}
              </span>
            )}
          </div>
        ))}
        <div className="px-2.5 py-1 text-gray-400 text-[10px] text-center">… {items.length} pages au total</div>
      </div>
    </div>
  );
}

function MockupTopbar() {
  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm text-xs">
      <div className="w-7 h-7 border border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-base">☰</div>
      <span className="font-semibold text-gray-700 flex-1">Confirmation</span>
      <span className="text-gray-400 text-[11px] hidden sm:block">mar. 14 avr.</span>
      <div className="relative w-8 h-8 border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 text-base">
        🔔
        <span className="absolute top-0.5 right-0.5 w-3 h-3 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">3</span>
      </div>
    </div>
  );
}

function MockupTabs({ tabs }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t, i) => (
        <div key={i} className="relative">
          <div className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition
            ${t.active
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}>
            {t.label}
          </div>
          {t.note && (
            <div className="absolute -top-5 left-0 text-[9px] text-indigo-500 font-medium whitespace-nowrap">{t.note}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function MockupOrderCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden text-xs max-w-sm">
      {/* Badge + icons */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold text-[11px]">CONFIRMÉ</span>
        <div className="flex gap-1 text-base">✅🖨️🏷️</div>
      </div>
      {/* Nom + ID */}
      <div className="px-4 pb-1">
        <p className="font-bold text-gray-900 text-sm">Ahmed Benali</p>
        <p className="text-gray-400 text-[11px]">NC-2847 · il y a 2h</p>
      </div>
      {/* Infos */}
      <div className="px-4 py-2 border-t border-gray-50 space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">📞</span>
          <span className="font-semibold text-gray-800">0555 123 456</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">📍 Wilaya</span>
          <span className="font-semibold text-gray-800">Alger / Hussein Dey</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">🛍️ Articles</span>
          <span className="font-semibold text-gray-800">Toppik Noir 55g ×2</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">💰 Total</span>
          <span className="font-bold text-gray-900">3 800 DA</span>
        </div>
      </div>
    </div>
  );
}

function MockupBadges({ badges }) {
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b, i) => (
        <div key={i} className="group relative">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${b.color}`}>
            {b.label || "(aucun badge)"}
          </span>
          <div className="hidden group-hover:block absolute bottom-8 left-0 w-48 bg-gray-900 text-white text-[11px] p-2 rounded-lg z-10 shadow-xl">
            {b.desc}
          </div>
        </div>
      ))}
    </div>
  );
}

function MockupAlertIcons({ icons }) {
  return (
    <div className="flex flex-wrap gap-3">
      {icons.map((item, i) => (
        <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <span className="text-xl">{item.icon}</span>
          <div>
            <p className="text-xs font-semibold text-gray-900">{item.label}</p>
            <p className="text-[11px] text-gray-500 max-w-[200px] leading-tight">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MockupActions({ actions }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) => (
        <div key={i} className="group relative">
          <button className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${a.color}`}>
            {a.label}
          </button>
          <div className="hidden group-hover:block absolute bottom-10 left-0 w-52 bg-gray-900 text-white text-[11px] p-2 rounded-lg z-10 shadow-xl">
            {a.desc}
          </div>
        </div>
      ))}
    </div>
  );
}

function MockupZRStatuts({ statuts }) {
  return (
    <div className="space-y-2">
      {statuts.map((s, i) => (
        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${s.color}`}>
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
          {s.label}
        </div>
      ))}
    </div>
  );
}

function MockupUrgencyLevels({ levels }) {
  return (
    <div className="space-y-2">
      {levels.map((l, i) => (
        <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs ${l.color}`}>
          <div>
            <p className="font-bold">{l.label}</p>
            <p className="mt-0.5 opacity-80">{l.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MockupPosTiles() {
  const tiles = [
    { name: "Toppik Noir 55g", price: "1 800 DA", stock: 12 },
    { name: "Toppik Brun 100g", price: "2 200 DA", stock: 0 },
    { name: "Derma Roller 0.5", price: "850 DA", stock: 5 },
    { name: "Gel Coiffant Pro", price: "650 DA", stock: 3 },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tiles.map((t, i) => (
        <div key={i} className={`relative border rounded-xl p-3 text-center text-xs ${t.stock === 0 ? "opacity-50 border-gray-200 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-400 cursor-pointer"}`}>
          {t.stock === 0 && (
            <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">RUPTURE</span>
          )}
          <div className="w-10 h-10 bg-gray-100 rounded-lg mx-auto mb-2 flex items-center justify-center text-xl">📦</div>
          <p className="font-semibold text-gray-900 text-[11px] leading-tight mb-1">{t.name}</p>
          <p className="text-indigo-600 font-bold">{t.price}</p>
        </div>
      ))}
    </div>
  );
}

function renderMockup(mockup) {
  if (!mockup) return null;
  switch (mockup.type) {
    case "sidebar":     return <MockupSidebar items={mockup.items} />;
    case "topbar":      return <MockupTopbar />;
    case "tabs":        return <MockupTabs tabs={mockup.tabs} />;
    case "order-card":  return <MockupOrderCard />;
    case "badges":      return <MockupBadges badges={mockup.badges} />;
    case "alert-icons": return <MockupAlertIcons icons={mockup.icons} />;
    case "actions":     return <MockupActions actions={mockup.actions} />;
    case "zr-statuts":  return <MockupZRStatuts statuts={mockup.statuts} />;
    case "urgency-levels": return <MockupUrgencyLevels levels={mockup.levels} />;
    case "pos-tiles":   return <MockupPosTiles />;
    default:            return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  COMPOSANT SOUS-SECTION
// ═══════════════════════════════════════════════════════════════════

const SECTION_COLORS = {
  gray:    { accent: "bg-gray-900", light: "bg-gray-50 border-gray-200",  icon: "text-gray-700", badge: "bg-gray-100 text-gray-700", detail: "border-l-gray-400" },
  green:   { accent: "bg-green-600", light: "bg-green-50 border-green-200", icon: "text-green-700", badge: "bg-green-100 text-green-700", detail: "border-l-green-500" },
  purple:  { accent: "bg-purple-600", light: "bg-purple-50 border-purple-200", icon: "text-purple-700", badge: "bg-purple-100 text-purple-700", detail: "border-l-purple-500" },
  blue:    { accent: "bg-blue-600", light: "bg-blue-50 border-blue-200",  icon: "text-blue-700", badge: "bg-blue-100 text-blue-700",  detail: "border-l-blue-500" },
  amber:   { accent: "bg-amber-600", light: "bg-amber-50 border-amber-200", icon: "text-amber-700", badge: "bg-amber-100 text-amber-700", detail: "border-l-amber-500" },
  slate:   { accent: "bg-slate-700", light: "bg-slate-50 border-slate-200", icon: "text-slate-700", badge: "bg-slate-100 text-slate-700", detail: "border-l-slate-500" },
  indigo:  { accent: "bg-indigo-600", light: "bg-indigo-50 border-indigo-200", icon: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700", detail: "border-l-indigo-500" },
  teal:    { accent: "bg-teal-600", light: "bg-teal-50 border-teal-200",  icon: "text-teal-700", badge: "bg-teal-100 text-teal-700",  detail: "border-l-teal-500" },
  violet:  { accent: "bg-violet-600", light: "bg-violet-50 border-violet-200", icon: "text-violet-700", badge: "bg-violet-100 text-violet-700", detail: "border-l-violet-500" },
  orange:  { accent: "bg-orange-600", light: "bg-orange-50 border-orange-200", icon: "text-orange-700", badge: "bg-orange-100 text-orange-700", detail: "border-l-orange-500" },
  emerald: { accent: "bg-emerald-600", light: "bg-emerald-50 border-emerald-200", icon: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700", detail: "border-l-emerald-500" },
  rose:    { accent: "bg-rose-600", light: "bg-rose-50 border-rose-200",  icon: "text-rose-700", badge: "bg-rose-100 text-rose-700",  detail: "border-l-rose-500" },
  cyan:    { accent: "bg-cyan-600", light: "bg-cyan-50 border-cyan-200",  icon: "text-cyan-700", badge: "bg-cyan-100 text-cyan-700",  detail: "border-l-cyan-500" },
  sky:     { accent: "bg-sky-600", light: "bg-sky-50 border-sky-200",    icon: "text-sky-700",  badge: "bg-sky-100 text-sky-700",   detail: "border-l-sky-500" },
};

function SubsectionCard({ sub, c, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition"
      >
        <span className="text-xl flex-shrink-0">{sub.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{sub.title}</p>
          {!open && sub.content && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{sub.content}</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      {open && (
        <div className="px-5 pb-6 border-t border-gray-100 space-y-4">
          {/* Description */}
          {sub.content && (
            <p className="text-sm text-gray-600 leading-relaxed mt-4">{sub.content}</p>
          )}

          {/* Mockup visuel */}
          {sub.mockup && (
            <div className={`rounded-2xl border p-4 ${c.light}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Aperçu visuel</p>
              {renderMockup(sub.mockup)}
            </div>
          )}

          {/* Détails */}
          {sub.details && sub.details.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Explication détaillée</p>
              {sub.details.map((d, i) => (
                <div key={i} className={`pl-3 border-l-2 ${c.detail} py-1`}>
                  <p className="text-xs font-bold text-gray-900">{d.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{d.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  COMPOSANT SECTION PRINCIPALE
// ═══════════════════════════════════════════════════════════════════

function SectionBlock({ section, isVisible }) {
  const [open, setOpen] = useState(false);
  const c = SECTION_COLORS[section.color] || SECTION_COLORS.gray;
  const ref = useRef(null);

  // Auto-ouvrir si trouvé par la recherche
  useEffect(() => {
    if (isVisible && !open) setOpen(true);
  }, [isVisible]);

  return (
    <div ref={ref} id={`section-${section.id}`} className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header section */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-4 px-5 py-5 text-left transition
          ${open ? c.accent + " text-white" : "bg-white hover:bg-gray-50"}`}
      >
        <span className="text-3xl flex-shrink-0">{section.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-lg ${open ? "text-white" : "text-gray-900"}`}>{section.title}</p>
          <p className={`text-sm mt-0.5 ${open ? "text-white/80" : "text-gray-400"}`}>{section.desc}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${open ? "bg-white/20 text-white" : c.badge}`}>
            {section.subsections.length} sujet{section.subsections.length > 1 ? "s" : ""}
          </span>
          <svg
            className={`w-5 h-5 transition-transform duration-200 ${open ? "rotate-180 text-white" : "text-gray-400"}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Sous-sections */}
      {open && (
        <div className="bg-gray-50/50 p-4 space-y-3">
          {section.subsections.map((sub, i) => (
            <SubsectionCard key={sub.id} sub={sub} c={c} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════

export default function FormationPage() {
  const [search, setSearch] = useState("");
  const [tocOpen, setTocOpen] = useState(false);

  // Filtrage par recherche
  const visibleSections = useMemo(() => {
    if (!search.trim()) return SECTIONS.map(s => ({ ...s, visible: true }));
    const q = search.toLowerCase().trim();
    return SECTIONS.map(s => {
      const inTitle = s.title.toLowerCase().includes(q);
      const inDesc = s.desc.toLowerCase().includes(q);
      const inSubs = s.subsections.some(sub =>
        sub.title.toLowerCase().includes(q) ||
        (sub.content || "").toLowerCase().includes(q) ||
        (sub.details || []).some(d => d.label.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q))
      );
      return { ...s, visible: inTitle || inDesc || inSubs };
    }).filter(s => s.visible);
  }, [search]);

  const totalSujets = SECTIONS.reduce((acc, s) => acc + s.subsections.length, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">

      {/* ── HERO ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-8 text-white">
        {/* Fond décoratif */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
        </div>
        <div className="relative">
          <div className="flex items-start gap-5">
            <div className="text-5xl">🎓</div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Formation Complète</h1>
              <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
                Guide exhaustif de chaque page, bouton, badge et action du dashboard{" "}
                <strong className="text-white">Najm Coiff</strong>. Chaque élément est expliqué en détail.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="bg-white/10 border border-white/20 px-3 py-1.5 rounded-full font-medium">
              📄 {SECTIONS.length} pages documentées
            </span>
            <span className="bg-white/10 border border-white/20 px-3 py-1.5 rounded-full font-medium">
              🔍 {totalSujets} sujets détaillés
            </span>
            <span className="bg-white/10 border border-white/20 px-3 py-1.5 rounded-full font-medium">
              🖼️ Mockups visuels inclus
            </span>
            <span className="bg-white/10 border border-white/20 px-3 py-1.5 rounded-full font-medium">
              ✅ Mis à jour V4.86
            </span>
          </div>
        </div>
      </div>

      {/* ── BARRE DE RECHERCHE ── */}
      <div className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une page, un bouton, un terme… (ex: 'badge rouge', 'confirmer', 'coupon')"
          className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm shadow-sm
            focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-gray-700"
          >✕</button>
        )}
      </div>

      {/* ── TABLE DES MATIÈRES ── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <button
          onClick={() => setTocOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📑</span>
            <span className="font-semibold text-gray-900 text-sm">Table des Matières</span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${tocOpen ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {tocOpen && (
          <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SECTIONS.map(s => {
              const c = SECTION_COLORS[s.color] || SECTION_COLORS.gray;
              return (
                <a
                  key={s.id}
                  href={`#section-${s.id}`}
                  onClick={() => setTocOpen(false)}
                  className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border transition hover:shadow-sm ${c.badge} ${c.light}`}
                >
                  <span>{s.icon}</span>
                  <span>{s.title}</span>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* ── RÉSULTATS RECHERCHE ── */}
      {search && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {visibleSections.length === 0
              ? "Aucun résultat"
              : `${visibleSections.length} section${visibleSections.length > 1 ? "s" : ""} trouvée${visibleSections.length > 1 ? "s" : ""}`}
          </span>
          {visibleSections.length === 0 && (
            <button onClick={() => setSearch("")} className="text-xs text-indigo-600 font-medium hover:underline">
              Effacer la recherche
            </button>
          )}
        </div>
      )}

      {/* ── SECTIONS ── */}
      <div className="space-y-4">
        {visibleSections.map(s => (
          <SectionBlock key={s.id} section={s} isVisible={!!search} />
        ))}
        {visibleSections.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-sm">Aucun résultat pour &ldquo;{search}&rdquo;</p>
            <p className="text-xs mt-2">Essaie : &ldquo;badge&rdquo;, &ldquo;confirmer&rdquo;, &ldquo;stock&rdquo;, &ldquo;coupon&rdquo;…</p>
          </div>
        )}
      </div>

      {/* ── RAPPELS IMPORTANTS ── */}
      {!search && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
            <span>⚡</span> Règles d&apos;or pour tout le monde
          </h3>
          <div className="space-y-2">
            {[
              { icon: "🔐", text: "Ne jamais partager ton mot de passe — chaque compte est personnel et toutes les actions sont tracées." },
              { icon: "💾", text: "Toutes tes actions sont sauvegardées automatiquement dans Supabase — la base de données est en temps réel." },
              { icon: "❓", text: "En cas de doute sur une commande, contacte ton responsable avant d'agir." },
              { icon: "🔄", text: "Si le dashboard affiche une erreur, actualise la page — les données sont toujours sauvegardées en base." },
              { icon: "📊", text: "Pour tout problème technique ou anomalie, utilise la page Rapport pour le signaler." },
              { icon: "📱", text: "Installe le dashboard comme application PWA (bouton 📲 en bas de la sidebar) pour un accès mobile optimal." },
            ].map((r, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-gray-600">
                <span className="text-base flex-shrink-0">{r.icon}</span>
                <span className="leading-relaxed">{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LIENS RAPIDES ── */}
      {!search && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 p-4 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition"
          >
            <span className="text-2xl">🏠</span>
            <div>
              <p className="text-sm font-semibold">Aller au dashboard</p>
              <p className="text-xs text-gray-400">Accueil principal</p>
            </div>
          </Link>
          <Link
            href="/dashboard/rapport"
            className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl hover:bg-rose-100 transition"
          >
            <span className="text-2xl">📊</span>
            <div>
              <p className="text-sm font-semibold text-rose-900">Signaler un problème</p>
              <p className="text-xs text-rose-500">Page Rapport</p>
            </div>
          </Link>
          <Link
            href="/dashboard/confirmation"
            className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl hover:bg-green-100 transition"
          >
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-sm font-semibold text-green-900">Confirmation</p>
              <p className="text-xs text-green-600">Gérer les commandes</p>
            </div>
          </Link>
          <Link
            href="/dashboard/pos"
            className="flex items-center gap-3 p-4 bg-violet-50 border border-violet-200 rounded-2xl hover:bg-violet-100 transition"
          >
            <span className="text-2xl">🖥️</span>
            <div>
              <p className="text-sm font-semibold text-violet-900">POS Comptoir</p>
              <p className="text-xs text-violet-600">Ventes en présentiel</p>
            </div>
          </Link>
        </div>
      )}

    </div>
  );
}
