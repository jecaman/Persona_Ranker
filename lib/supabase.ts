import { createClient } from "@supabase/supabase-js";

// Cliente para el SERVIDOR (API routes, scripts)
// Usa la service_role key — tiene acceso total a la base de datos
// Leemos las variables dentro de la función (no fuera) para que dotenv
// haya tenido tiempo de cargarlas antes de que se llame la función
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Cliente para el NAVEGADOR (componentes React del frontend)
// Usa la anon key — solo puede leer datos públicos
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
