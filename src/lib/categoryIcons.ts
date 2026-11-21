/**
 * Ícones oferecidos para categorias, agrupados por tema. Contém todos os ícones
 * aplicados na revisão de 11/2026: a lista antiga tinha 30 emojis e quase
 * metade das categorias reais usava um ícone fora dela.
 *
 * Só emojis até o Unicode 12, para aparecerem em celulares mais antigos.
 */
export const CATEGORY_ICON_GROUPS: ReadonlyArray<{ label: string; icons: readonly string[] }> = [
  { label: "Alimentação", icons: ["🍽️", "🍴", "🍔", "🍱", "🍕", "🥖", "🥘", "☕", "🍻", "🛒"] },
  { label: "Casa", icons: ["🏠", "🏡", "🏘️", "🏢", "🔑", "🧹", "💡", "🔥", "💧", "🌐", "🔧", "🔨", "🪑", "🏗️", "🛡️"] },
  { label: "Transporte", icons: ["🚗", "🚘", "🚙", "🚕", "🚌", "⛽", "🅿️", "🛣️", "🚧", "🧽", "🔩", "🚨"] },
  { label: "Viagem", icons: ["✈️", "🛫", "🏨", "🧳", "🗺️", "⭐"] },
  { label: "Saúde", icons: ["🏥", "💊", "🩺", "🩹", "💉", "🧠", "💪", "🦷"] },
  { label: "Lazer", icons: ["🎡", "🎬", "🎤", "🎮", "🎉", "🚶", "🎯", "🎁", "🎟️", "🎫"] },
  { label: "Educação", icons: ["🎓", "📚", "📖", "🗣️", "✏️"] },
  { label: "Pessoal", icons: ["👕", "👗", "👔", "💇", "🧺", "🛍️", "💝"] },
  { label: "Pets e plantas", icons: ["🐕", "🐈", "🦴", "🐾", "🌱"] },
  { label: "Trabalho", icons: ["💼", "🏬", "🤝", "🎥", "💻", "📱"] },
  { label: "Finanças", icons: ["💰", "💵", "💸", "💳", "🏦", "📈", "📉", "🧾", "📄", "📋", "🔄", "🔁", "↩️", "☂️"] },
  { label: "Outros", icons: ["📦", "❓", "⚙️", "📺"] },
];

/** O banco pode ter o emoji com ou sem o seletor de variação (U+FE0F). */
export const normalizeIcon = (icon: string) => icon.replace(/\uFE0F/g, "");
