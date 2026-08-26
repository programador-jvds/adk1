export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA-58AAdPJOsT_GDOdwV1oKNZ0wj9DYC2w",
  authDomain: "kleimpaul-c9810.firebaseapp.com",
  projectId: "kleimpaul-c9810",
  messagingSenderId: "1094353351727",
  appId: "1:1094353351727:web:14ba727e774be80bf9c2da"
};
export const DEFAULT_COMPANY_ID = "1";
export const FIREBASE_VERSION = "12.18.0";
export function adminEmail(usuario, empresa){
  const u = String(usuario || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const e = String(empresa || "").trim().replace(/[^a-z0-9_-]/gi, "");
  return `${u}@empresa${e}.kleimpaul.com`;
}
