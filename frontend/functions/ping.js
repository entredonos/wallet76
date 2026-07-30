// O /ping tinha rewrite proprio no vercel.json porque nao vive debaixo de /api.
// Reutiliza o mesmo proxy para nao haver duas versoes da mesma logica a
// divergirem com o tempo.
export { onRequest } from "./api/[[path]].js";
