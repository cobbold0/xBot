/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  serverExternalPackages: ['pg', 'rettiwt-api'],
  poweredByHeader: false,
};
