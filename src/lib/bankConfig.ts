// Bank and card brand configuration for automatic logo/color detection

export interface BankConfig {
  name: string;
  color: string;
  icon: string;
  logo?: string;
}

export const bankConfigs: Record<string, BankConfig> = {
  nubank: {
    name: "Nubank",
    color: "from-purple-500 via-purple-600 to-purple-700",
    icon: "💜",
  },
  itau: {
    name: "Itaú",
    color: "from-orange-500 via-orange-600 to-amber-600",
    icon: "🧡",
  },
  bradesco: {
    name: "Bradesco",
    color: "from-red-600 via-red-700 to-red-800",
    icon: "❤️",
  },
  santander: {
    name: "Santander",
    color: "from-red-500 via-red-600 to-red-700",
    icon: "🔴",
  },
  inter: {
    name: "Inter",
    color: "from-orange-500 via-orange-600 to-orange-700",
    icon: "🟠",
  },
  bb: {
    name: "Banco do Brasil",
    color: "from-yellow-400 via-yellow-500 to-yellow-600",
    icon: "💛",
  },
  caixa: {
    name: "Caixa",
    color: "from-blue-500 via-blue-600 to-blue-700",
    icon: "💙",
  },
  c6: {
    name: "C6 Bank",
    color: "from-gray-800 via-gray-900 to-black",
    icon: "⚫",
  },
  neon: {
    name: "Neon",
    color: "from-cyan-400 via-cyan-500 to-cyan-600",
    icon: "💎",
  },
  picpay: {
    name: "PicPay",
    color: "from-green-400 via-green-500 to-green-600",
    icon: "💚",
  },
  original: {
    name: "Banco Original",
    color: "from-lime-500 via-lime-600 to-lime-700",
    icon: "🟢",
  },
  xp: {
    name: "XP",
    color: "from-gray-700 via-gray-800 to-gray-900",
    icon: "⬛",
  },
  btg: {
    name: "BTG Pactual",
    color: "from-blue-800 via-blue-900 to-indigo-900",
    icon: "🔵",
  },
  next: {
    name: "Next",
    color: "from-green-500 via-green-600 to-green-700",
    icon: "💚",
  },
  pagbank: {
    name: "PagBank",
    color: "from-green-600 via-green-700 to-green-800",
    icon: "🟩",
  },
  mercadopago: {
    name: "Mercado Pago",
    color: "from-blue-400 via-blue-500 to-blue-600",
    icon: "💙",
  },
};

export function detectBankFromName(name: string): BankConfig | null {
  const normalizedName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  for (const [key, config] of Object.entries(bankConfigs)) {
    if (normalizedName.includes(key) || normalizedName.includes(config.name.toLowerCase())) {
      return config;
    }
  }
  
  // Check for common variations
  if (normalizedName.includes("banco do brasil") || normalizedName === "bb") {
    return bankConfigs.bb;
  }
  if (normalizedName.includes("mercado pago") || normalizedName.includes("mercadopago")) {
    return bankConfigs.mercadopago;
  }
  
  return null;
}

export const cardBrandConfigs: Record<string, { color: string; icon: string }> = {
  visa: { color: "from-blue-600 via-blue-700 to-blue-800", icon: "💳" },
  mastercard: { color: "from-orange-500 via-red-500 to-red-600", icon: "💳" },
  elo: { color: "from-yellow-500 via-orange-500 to-orange-600", icon: "💳" },
  "american express": { color: "from-blue-500 via-blue-600 to-blue-700", icon: "💳" },
  amex: { color: "from-blue-500 via-blue-600 to-blue-700", icon: "💳" },
  hipercard: { color: "from-red-600 via-red-700 to-red-800", icon: "💳" },
};
