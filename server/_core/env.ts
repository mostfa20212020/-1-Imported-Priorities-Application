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
  archiveRootPath: cleanEnv(process.env.ARCHIVE_ROOT_PATH) || "Archive",
  localMysqlHost: cleanEnv(process.env.LOCAL_MYSQL_HOST),
  localMysqlPort: cleanEnv(process.env.LOCAL_MYSQL_PORT) ? Number(process.env.LOCAL_MYSQL_PORT) : 3306,
  localMysqlUser: cleanEnv(process.env.LOCAL_MYSQL_USER),
  localMysqlPassword: cleanEnv(process.env.LOCAL_MYSQL_PASSWORD),
  localMysqlDatabase: cleanEnv(process.env.LOCAL_MYSQL_DATABASE),
  localMysqlUrl: cleanEnv(process.env.LOCAL_MYSQL_URL),
};

