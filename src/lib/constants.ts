/**
 * Constantes compartilhadas do sistema
 * 
 * Centraliza valores que são usados em múltiplos lugares
 * para evitar duplicação e facilitar manutenção.
 */

// ============= Cores para seleção de categorias =============

export const CATEGORY_COLOR_OPTIONS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
  "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#F43F5E", "#6B7280"
] as const;

// Versão reduzida para modais menores
export const CATEGORY_COLOR_OPTIONS_COMPACT = [
  "#EF4444", "#F97316", "#F59E0B", "#22C55E", 
  "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280"
] as const;

// ============= Cores de fallback =============

export const FALLBACK_CATEGORY_COLOR = "#6B7280";
export const FALLBACK_PRIMARY_COLOR = "#3B82F6";
export const FALLBACK_CATEGORY_ICON = "📦";

// ============= Emojis para seleção de ícones =============

export const CATEGORY_EMOJI_OPTIONS = [
  "🍔", "🍽️", "🛒", "🏠", "💡", "🚗", "⛽", "🚌", "✈️", "🏨",
  "🎬", "🎮", "🎯", "🎪", "📚", "💊", "🏥", "💪", "👕", "💇",
  "🐕", "🐈", "🌱", "💰", "💳", "📱", "💻", "📦", "🎁", "☕"
] as const;
