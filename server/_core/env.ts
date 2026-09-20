const cleanEnv = (val: string | undefined): string => {
  if (!val) return "";
  if (val.includes("@123@123")) return "";
  return val.trim();
};

export const ENV = {
  appId: cleanEnv(process.env.VITE_APP_ID),
  cookieSecret: cleanEnv(process.env.JWT_SECRET),
  databaseUrl: cleanEnv(process.env.DATABASE_URL),
  oAuthServerUrl: cleanEnv(process.env.OAUTH_SERVER_URL),
  ownerOpenId: cleanEnv(process.env.OWNER_OPEN_ID),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: cleanEnv(process.env.BUILT_IN_FORGE_API_URL),
  forgeApiKey: cleanEnv(process.env.BUILT_IN_FORGE_API_KEY),
};

