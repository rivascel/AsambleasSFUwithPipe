
export const config = {
  env: process.env.NODE_ENV,
  isProd:process.env.NODE_ENV === 'production',
  port: process.env.PORT,
  // BaseUrl: process.env.BACKEND_URL,
  FrontEndBaseUrl: process.env.FRONTEND_URL,
  BackEndBaseUrl: process.env.BACKEND_URL,
  jwtSecret: process.env.JWT_SECRET_KEY,
  api_key:process.env.RESEND_API_KEY,
  announcedIp: process.env.ANNOUNCED_IP,
  ip: process.env.IP,

}
