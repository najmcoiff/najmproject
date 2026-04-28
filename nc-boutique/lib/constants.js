// ============================================================
// lib/constants.js — Source de vérité des nomenclatures
// NE PAS changer les valeurs sans mettre à jour nc_page_events
// ============================================================

export const EVENT_TYPES = {
  PAGE_VIEW:              "PAGE_VIEW",
  PRODUCT_VIEW:           "PRODUCT_VIEW",
  PRODUCT_VARIANT_SELECT: "PRODUCT_VARIANT_SELECT",
  CART_ADD:               "CART_ADD",
  CART_REMOVE:            "CART_REMOVE",
  CART_VIEW:              "CART_VIEW",
  CHECKOUT_START:         "CHECKOUT_START",
  CHECKOUT_STEP:          "CHECKOUT_STEP",
  ORDER_PLACED:           "ORDER_PLACED",
  ORDER_FAILED:           "ORDER_FAILED",
  TRACK_VIEW:             "TRACK_VIEW",
  SEARCH:                 "SEARCH",
  FILTER_APPLIED:         "FILTER_APPLIED",
  SHARE:                  "SHARE",
};

export const LOG_TYPES = {
  ORDER_PLACED:   "BOUTIQUE_ORDER_PLACED",
  ORDER_FAILED:   "BOUTIQUE_ORDER_FAILED",
  STOCK_ALERT:    "BOUTIQUE_STOCK_ALERT",
  CART_ABANDONED: "BOUTIQUE_CART_ABANDONED",
  TRACK_VIEWED:   "BOUTIQUE_TRACK_VIEWED",
};

export const ORDER_SOURCES = {
  NC_BOUTIQUE: "nc_boutique",
  SHOPIFY:     "shopify",
  WEB:         "web",
  POS:         "pos",
};

export const MOVEMENT_TYPES = {
  SALE:        "SALE",
  PO_RECEIPT:  "PO_RECEIPT",
  ADJUSTMENT:  "ADJUSTMENT",
  RETURN:      "RETURN",
  BARRAGE:     "BARRAGE",
  CORRECTION:  "CORRECTION",
};

// 58 wilayas d'Algérie (code + nom)
export const WILAYAS = [
  { code: "01", name: "Adrar" },
  { code: "02", name: "Chlef" },
  { code: "03", name: "Laghouat" },
  { code: "04", name: "Oum El Bouaghi" },
  { code: "05", name: "Batna" },
  { code: "06", name: "Béjaïa" },
  { code: "07", name: "Biskra" },
  { code: "08", name: "Béchar" },
  { code: "09", name: "Blida" },
  { code: "10", name: "Bouira" },
  { code: "11", name: "Tamanrasset" },
  { code: "12", name: "Tébessa" },
  { code: "13", name: "Tlemcen" },
  { code: "14", name: "Tiaret" },
  { code: "15", name: "Tizi Ouzou" },
  { code: "16", name: "Alger" },
  { code: "17", name: "Djelfa" },
  { code: "18", name: "Jijel" },
  { code: "19", name: "Sétif" },
  { code: "20", name: "Saïda" },
  { code: "21", name: "Skikda" },
  { code: "22", name: "Sidi Bel Abbès" },
  { code: "23", name: "Annaba" },
  { code: "24", name: "Guelma" },
  { code: "25", name: "Constantine" },
  { code: "26", name: "Médéa" },
  { code: "27", name: "Mostaganem" },
  { code: "28", name: "M'Sila" },
  { code: "29", name: "Mascara" },
  { code: "30", name: "Ouargla" },
  { code: "31", name: "Oran" },
  { code: "32", name: "El Bayadh" },
  { code: "33", name: "Illizi" },
  { code: "34", name: "Bordj Bou Arreridj" },
  { code: "35", name: "Boumerdès" },
  { code: "36", name: "El Tarf" },
  { code: "37", name: "Tindouf" },
  { code: "38", name: "Tissemsilt" },
  { code: "39", name: "El Oued" },
  { code: "40", name: "Khenchela" },
  { code: "41", name: "Souk Ahras" },
  { code: "42", name: "Tipaza" },
  { code: "43", name: "Mila" },
  { code: "44", name: "Aïn Defla" },
  { code: "45", name: "Naâma" },
  { code: "46", name: "Aïn Témouchent" },
  { code: "47", name: "Ghardaïa" },
  { code: "48", name: "Relizane" },
  { code: "49", name: "Timimoun" },
  { code: "50", name: "Bordj Badji Mokhtar" },
  { code: "51", name: "Ouled Djellal" },
  { code: "52", name: "Béni Abbès" },
  { code: "53", name: "In Salah" },
  { code: "54", name: "In Guezzam" },
  { code: "55", name: "Touggourt" },
  { code: "56", name: "Djanet" },
  { code: "57", name: "El M'Ghair" },
  { code: "58", name: "El Meniaa" },
];

export const STOCK_STATUS = {
  IN_STOCK:    { label: "متوفر",        color: "text-green-500" },
  LOW_STOCK:   { label: "",             color: "" },
  OUT_OF_STOCK:{ label: "نفد المخزون", color: "text-red-500" },
};

export function getStockStatus(qty) {
  const n = Number(qty);
  if (n <= 0) return STOCK_STATUS.OUT_OF_STOCK;
  if (n <= 3)  return STOCK_STATUS.LOW_STOCK;
  return STOCK_STATUS.IN_STOCK;
}
