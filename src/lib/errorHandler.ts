/**
 * SECURITY: Centralized error handling utility
 * 
 * Never expose internal error details to users.
 * This module provides safe error messages for different contexts.
 */

// Generic error messages that don't expose system internals
const SAFE_ERROR_MESSAGES = {
  // Authentication errors
  auth_invalid_credentials: "Email ou senha incorretos",
  auth_user_not_found: "Usuário não encontrado",
  auth_session_expired: "Sua sessão expirou. Faça login novamente",
  auth_unauthorized: "Acesso não autorizado",
  
  // Database errors
  db_connection: "Erro ao conectar com o servidor",
  db_query: "Erro ao processar sua solicitação",
  db_not_found: "Registro não encontrado",
  db_duplicate: "Este registro já existe",
  db_constraint: "Não foi possível completar a operação",
  
  // Network errors
  network_timeout: "Tempo de conexão esgotado. Tente novamente",
  network_offline: "Sem conexão com a internet",
  network_error: "Erro de comunicação com o servidor",
  
  // File errors
  file_too_large: "Arquivo muito grande",
  file_invalid_type: "Tipo de arquivo não suportado",
  file_upload_failed: "Erro ao enviar arquivo",
  
  // Generic
  generic: "Erro ao processar solicitação",
  validation: "Dados inválidos",
  permission_denied: "Você não tem permissão para esta ação",
} as const;

type ErrorType = keyof typeof SAFE_ERROR_MESSAGES;

/**
 * Get a safe error message for display to users
 * Never exposes internal error details
 */
export function getSafeErrorMessage(error: unknown, defaultType: ErrorType = "generic"): string {
  // If it's already a safe message type, return it
  if (typeof error === "string" && error in SAFE_ERROR_MESSAGES) {
    return SAFE_ERROR_MESSAGES[error as ErrorType];
  }

  // Check for known Supabase/Postgres error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Auth errors
    if (message.includes("invalid login credentials")) {
      return SAFE_ERROR_MESSAGES.auth_invalid_credentials;
    }
    if (message.includes("jwt") || message.includes("token")) {
      return SAFE_ERROR_MESSAGES.auth_session_expired;
    }
    if (message.includes("unauthorized") || message.includes("401")) {
      return SAFE_ERROR_MESSAGES.auth_unauthorized;
    }
    
    // Database errors - NEVER expose column/table names
    if (message.includes("duplicate") || message.includes("unique")) {
      return SAFE_ERROR_MESSAGES.db_duplicate;
    }
    if (message.includes("foreign key") || message.includes("constraint")) {
      return SAFE_ERROR_MESSAGES.db_constraint;
    }
    if (message.includes("not found") || message.includes("no rows")) {
      return SAFE_ERROR_MESSAGES.db_not_found;
    }
    
    // Network errors
    if (message.includes("timeout")) {
      return SAFE_ERROR_MESSAGES.network_timeout;
    }
    if (message.includes("network") || message.includes("fetch")) {
      return SAFE_ERROR_MESSAGES.network_error;
    }
    
    // RLS policy violations - generic message
    if (message.includes("row-level security") || message.includes("rls")) {
      return SAFE_ERROR_MESSAGES.permission_denied;
    }
  }

  // Return default safe message
  return SAFE_ERROR_MESSAGES[defaultType];
}

/**
 * Log error for debugging (server-side only)
 * In production, this should send to a logging service
 */
export function logError(error: unknown, context?: string): void {
  // In development, log full error
  if (import.meta.env.DEV) {
    console.error(`[${context || "Error"}]`, error);
  } else {
    // In production, log minimal info without exposing internals
    console.error(`[${context || "Error"}] An error occurred`);
  }
}

/**
 * Handle API errors safely
 * Returns a user-friendly message without exposing internals
 */
export function handleApiError(error: unknown, context?: string): string {
  logError(error, context);
  return getSafeErrorMessage(error);
}
