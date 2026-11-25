import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'pg-boss', 'exceljs'],
  // a tela Andamentos virou Alertas: links e favoritos antigos continuam funcionando
  async redirects() {
    return [{ source: '/andamentos', destination: '/alertas', permanent: true }];
  },
};

export default config;
