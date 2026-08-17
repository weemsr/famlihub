import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/BottomNav';
import AuthProvider from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'FamLi Hub',
  description: 'Family hub: groceries, meals, recipes, to-dos, notes, pantry, calendar, credit cards, and home upkeep.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FamLi Hub',
  },
  // Square icons — the masthead logo is a 1024x338 banner, so using it here
  // gave iOS a letterboxed home-screen tile and made Chrome reject the install
  // prompt for not matching its declared sizes.
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F7F7' },
    { media: '(prefers-color-scheme: dark)', color: '#111215' },
  ],
};

// No-flash theme bootstrap. Runs before React hydrates so there is never a
// light-mode flash for users who chose dark (or whose system prefers it).
const noFlashThemeScript = `
(function(){
  try {
    var t = localStorage.getItem('famli.theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashThemeScript }} />
      </head>
      <body>
        <AuthProvider>
          <main className="container">
            {children}
          </main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
